import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const defaultRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const migrationPaths = [
  "packages/database/migrations/0006_editorial_workflow.sql",
  "packages/database/migrations/0007_editorial_invariant_triggers.sql",
  "packages/database/migrations/0008_editorial_approval_guards.sql",
  "packages/database/migrations/0009_editorial_document_identity_guards.sql",
];
const schemaPath = "packages/database/src/schema/editorial.ts";
const publicReadPath =
  "packages/database/src/repositories/published-editorial-read-model.ts";

const expectedTables = [
  "editorial_documents",
  "editorial_revisions",
  "editorial_reviews",
  "editorial_events",
];
const expectedSchemaSymbols = [
  "editorialDocuments",
  "editorialRevisions",
  "editorialReviews",
  "editorialEvents",
];
const expectedTriggers = [
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
];

function read(root, path) {
  const absolute = join(root, path);
  return existsSync(absolute) ? readFileSync(absolute, "utf8") : null;
}

export function checkEditorialSchemaConsistency(root = defaultRoot) {
  const absoluteRoot = resolve(root);
  const violations = [];
  const migrations = migrationPaths.map((path) => ({ path, content: read(absoluteRoot, path) }));
  for (const migration of migrations) {
    if (migration.content === null) {
      violations.push(`EDITORIAL_MIGRATION_MISSING: ${migration.path}`);
    }
  }
  const combined = migrations.map((migration) => migration.content ?? "").join("\n");

  for (const table of expectedTables) {
    if (!new RegExp(`CREATE\\s+TABLE\\s+(?:IF\\s+NOT\\s+EXISTS\\s+)?${table}\\b`, "iu").test(combined)) {
      violations.push(`EDITORIAL_TABLE_MISSING: ${table}`);
    }
    if (!new RegExp(`CREATE\\s+(?:UNIQUE\\s+)?INDEX[\\s\\S]*?ON\\s+${table}\\s*\\(`, "iu").test(combined)) {
      violations.push(`EDITORIAL_INDEX_MISSING: ${table}`);
    }
  }
  for (const trigger of expectedTriggers) {
    if (!new RegExp(`CREATE\\s+TRIGGER\\s+(?:IF\\s+NOT\\s+EXISTS\\s+)?${trigger}\\b`, "iu").test(combined)) {
      violations.push(`EDITORIAL_TRIGGER_MISSING: ${trigger}`);
    }
  }

  const schema = read(absoluteRoot, schemaPath);
  if (schema === null) {
    violations.push(`EDITORIAL_SCHEMA_MISSING: ${schemaPath}`);
  } else {
    for (const symbol of expectedSchemaSymbols) {
      if (!new RegExp(`export\\s+const\\s+${symbol}\\b`, "u").test(schema)) {
        violations.push(`EDITORIAL_SCHEMA_SYMBOL_MISSING: ${symbol}`);
      }
    }
  }

  const publicRead = read(absoluteRoot, publicReadPath);
  if (publicRead === null) {
    violations.push(`EDITORIAL_PUBLIC_READ_MISSING: ${publicReadPath}`);
  } else {
    if (!/document\.published_revision_id/u.test(publicRead)) {
      violations.push("EDITORIAL_PUBLIC_READ_NOT_BOUND_TO_PUBLISHED_REVISION");
    }
    if (!/editorial\.(?:published|rolled_back)/u.test(publicRead)) {
      violations.push("EDITORIAL_PUBLIC_READ_NOT_BOUND_TO_PUBLICATION_EVENT");
    }
    if (/document\.updated_at\s+(?:AS\s+)?published_at/iu.test(publicRead)) {
      violations.push("EDITORIAL_PUBLIC_TIMESTAMP_USES_PRIVATE_DOCUMENT_ACTIVITY");
    }
    if (/working_revision_id/u.test(publicRead)) {
      violations.push("EDITORIAL_PUBLIC_READ_REFERENCES_WORKING_REVISION");
    }
  }

  return violations.sort();
}

const executedPath = process.argv[1] ? resolve(process.argv[1]) : null;
if (executedPath === fileURLToPath(import.meta.url)) {
  const violations = checkEditorialSchemaConsistency();
  if (violations.length === 0) {
    console.log("Editorial schema consistency passed.");
  } else {
    for (const violation of violations) console.error(violation);
    process.exitCode = 1;
  }
}
