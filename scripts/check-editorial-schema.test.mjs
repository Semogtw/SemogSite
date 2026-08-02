import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { checkEditorialSchemaConsistency } from "./check-editorial-schema.mjs";

function write(root, path, content) {
  const absolute = join(root, path);
  mkdirSync(dirname(absolute), { recursive: true });
  writeFileSync(absolute, content, "utf8");
}

function fixture(overrides = {}) {
  const root = mkdtempSync(join(tmpdir(), "semogtw-editorial-schema-"));
  const migration = `
    CREATE TABLE editorial_documents (id TEXT);
    CREATE UNIQUE INDEX editorial_documents_slug_unique ON editorial_documents (id);
    CREATE TABLE editorial_revisions (id TEXT);
    CREATE INDEX editorial_revisions_index ON editorial_revisions (id);
    CREATE TABLE editorial_reviews (id TEXT);
    CREATE INDEX editorial_reviews_index ON editorial_reviews (id);
    CREATE TABLE editorial_events (id TEXT);
    CREATE INDEX editorial_events_index ON editorial_events (id);
  `;
  const triggers = [
    "editorial_documents_approval_review_guard",
    "editorial_documents_publication_review_guard",
    "editorial_documents_revision_links_update",
    "editorial_documents_identity_immutable_update",
    "editorial_documents_version_guard",
    "editorial_revisions_contiguous_sequence_insert",
    "editorial_revisions_immutable_update",
    "editorial_reviews_revision_integrity_insert",
    "editorial_reviews_immutable_update",
    "editorial_events_contiguous_sequence_insert",
    "editorial_events_immutable_update",
  ]
    .map(
      (name) =>
        `CREATE TRIGGER ${name} BEFORE UPDATE ON editorial_documents BEGIN SELECT 1; END;`,
    )
    .join("\n");
  const files = {
    "packages/database/migrations/0006_editorial_workflow.sql": migration,
    "packages/database/migrations/0007_editorial_invariant_triggers.sql": triggers,
    "packages/database/migrations/0008_editorial_approval_guards.sql": "-- guards",
    "packages/database/migrations/0009_editorial_document_identity_guards.sql": "-- identity",
    "packages/database/src/schema/editorial.ts": [
      "export const editorialDocuments = {};",
      "export const editorialRevisions = {};",
      "export const editorialReviews = {};",
      "export const editorialEvents = {};",
    ].join("\n"),
    "packages/database/src/repositories/published-editorial-read-model.ts": `
      const query = "document.published_revision_id editorial.published editorial.rolled_back";
    `,
    ...overrides,
  };
  for (const [path, content] of Object.entries(files)) write(root, path, content);
  return root;
}

const validRoot = fixture();
try {
  assert.deepEqual(checkEditorialSchemaConsistency(validRoot), []);
} finally {
  rmSync(validRoot, { recursive: true, force: true });
}

const missingRoot = mkdtempSync(join(tmpdir(), "semogtw-editorial-schema-missing-"));
try {
  const violations = checkEditorialSchemaConsistency(missingRoot);
  assert.ok(
    violations.some((value) =>
      value.startsWith("EDITORIAL_MIGRATION_MISSING:"),
    ),
  );
  assert.ok(
    violations.some((value) => value.startsWith("EDITORIAL_TABLE_MISSING:")),
  );
  assert.ok(
    violations.some((value) => value.startsWith("EDITORIAL_SCHEMA_MISSING:")),
  );
} finally {
  rmSync(missingRoot, { recursive: true, force: true });
}

const leakingRoot = fixture({
  "packages/database/src/repositories/published-editorial-read-model.ts": `
    const query = "document.published_revision_id document.updated_at AS published_at working_revision_id";
  `,
});
try {
  const violations = checkEditorialSchemaConsistency(leakingRoot);
  assert.ok(
    violations.includes("EDITORIAL_PUBLIC_READ_NOT_BOUND_TO_PUBLICATION_EVENT"),
  );
  assert.ok(
    violations.includes("EDITORIAL_PUBLIC_TIMESTAMP_USES_PRIVATE_DOCUMENT_ACTIVITY"),
  );
  assert.ok(
    violations.includes("EDITORIAL_PUBLIC_READ_REFERENCES_WORKING_REVISION"),
  );
} finally {
  rmSync(leakingRoot, { recursive: true, force: true });
}

const brokenSchemaRoot = fixture({
  "packages/database/src/schema/editorial.ts":
    "export const editorialDocuments = {};\n",
});
try {
  const violations = checkEditorialSchemaConsistency(brokenSchemaRoot);
  assert.ok(
    violations.includes("EDITORIAL_SCHEMA_SYMBOL_MISSING: editorialReviews"),
  );
} finally {
  rmSync(brokenSchemaRoot, { recursive: true, force: true });
}

console.log("Editorial schema consistency fixtures passed.");
