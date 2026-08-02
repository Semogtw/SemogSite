import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { scanEditorialPublicConfidentiality } from "./check-editorial-confidentiality.mjs";

function scan(files) {
  const root = mkdtempSync(join(tmpdir(), "semogtw-editorial-confidentiality-"));
  try {
    for (const [path, content] of files) {
      const absolute = join(root, path);
      mkdirSync(dirname(absolute), { recursive: true });
      writeFileSync(absolute, content, "utf8");
    }
    return scanEditorialPublicConfidentiality(root);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

assert.deepEqual(
  scan([
    [
      "packages/contracts/src/public/editorial.test.ts",
      'const rejected = { workflowStatus: "draft" };\n',
    ],
    [
      "packages/contracts/src/public/editorial.spec.ts",
      'const rejected = { reviewerId: "fixture-only" };\n',
    ],
  ]),
  [],
  "test and spec files are not production public surfaces",
);

assert.deepEqual(
  scan([
    [
      "packages/contracts/src/public/editorial.ts",
      'export type PublicEditorial = { publishedRevisionId: string; title: string };\n',
    ],
    [
      "apps/web/src/routes/devos.editorial.index.tsx",
      'import type { EditorialDocumentSnapshot } from "@semogtw/domain";\n',
    ],
    [
      "apps/web/src/routes/projects.tsx",
      'export const projects = [{ slug: "semog-site", title: "SemogSite" }];\n',
    ],
  ]),
  [],
);

for (const [path, content, expectedCode] of [
  [
    "apps/web/src/routes/index.tsx",
    'import type { EditorialDocumentSnapshot } from "@semogtw/domain";\n',
    "EDITORIAL_PRIVATE_SYMBOL",
  ],
  [
    "apps/web/src/routes/projects.tsx",
    'const row = "SELECT * FROM editorial_reviews";\n',
    "EDITORIAL_PRIVATE_TABLE",
  ],
  [
    "apps/web/src/content/project.json",
    '{"workflowStatus":"draft"}',
    "EDITORIAL_PRIVATE_FIELD",
  ],
  [
    "apps/api/src/routes/public/editorial.ts",
    'const url = "/devos/editorial/document-1";\n',
    "EDITORIAL_PRIVATE_ROUTE",
  ],
  [
    "apps/web/src/routes/notes.tsx",
    'const module = await import("../../../packages/database/src/schema/editorial");\n',
    "EDITORIAL_PRIVATE_STORAGE_IMPORT",
  ],
]) {
  const violations = scan([[path, content]]);
  assert.ok(
    violations.some(
      (violation) =>
        violation.path === path && violation.code === expectedCode,
    ),
    `${path} should trigger ${expectedCode}`,
  );
}

const multiple = scan([
  [
    "apps/web/src/routes/index.tsx",
    'import type { EditorialApprovalSnapshot } from "@semogtw/domain";\nconst table = "editorial_events";\n',
  ],
]);
assert.deepEqual(
  multiple.map((violation) => violation.code).sort(),
  ["EDITORIAL_PRIVATE_SYMBOL", "EDITORIAL_PRIVATE_TABLE"],
);

console.log("Editorial public confidentiality fixtures passed.");
