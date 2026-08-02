import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { scanRunLedgerPublicConfidentiality } from "./check-run-ledger-confidentiality.mjs";

function scan(files) {
  const root = mkdtempSync(join(tmpdir(), "semogtw-run-confidentiality-"));
  try {
    for (const [path, content] of files) {
      const absolute = join(root, path);
      mkdirSync(dirname(absolute), { recursive: true });
      writeFileSync(absolute, content, "utf8");
    }
    return scanRunLedgerPublicConfidentiality(root);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

assert.deepEqual(
  scan([
    [
      "apps/web/src/routes/projects.tsx",
      'export const publicProjects = [{ slug: "semog-site", title: "SemogSite" }];\n',
    ],
    [
      "apps/web/src/routes/devos.runs.index.tsx",
      'import { SqliteCooperativeRunReadModel } from "@semogtw/database";\n',
    ],
    [
      "apps/api/src/routes/private/runs.ts",
      'export const privateRunRoute = "/devos/runs";\n',
    ],
  ]),
  [],
);

for (const [path, content, expectedCode] of [
  [
    "apps/web/src/routes/index.tsx",
    'import { SqliteCooperativeRunReadModel } from "@semogtw/database";\n',
    "RUN_LEDGER_PRIVATE_SYMBOL",
  ],
  [
    "apps/web/src/routes/notes.tsx",
    'export const hidden = "/devos/runs/run-1";\n',
    "RUN_LEDGER_PRIVATE_ROUTE",
  ],
  [
    "apps/web/src/content/project.json",
    '{"lastHeartbeatAt":"2026-08-01T20:00:00.000Z"}',
    "RUN_LEDGER_PRIVATE_PROJECTION",
  ],
  [
    "packages/contracts/src/public/project.ts",
    'export type PublicProject = { queueAvailability: string };\n',
    "RUN_LEDGER_PRIVATE_PROJECTION",
  ],
  [
    "apps/api/src/routes/public/projects.ts",
    'const query = "SELECT * FROM cooperative_run_commands";\n',
    "RUN_LEDGER_TABLE_NAME",
  ],
  [
    "apps/web/src/routes/about.tsx",
    'const module = await import("../../../packages/database/src/repositories/cooperative-run-read-model");\n',
    "RUN_LEDGER_DATABASE_IMPORT",
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
    'import { CooperativeRunCommandInboxService } from "@semogtw/domain";\nconst table = "cooperative_runs";\n',
  ],
]);
assert.equal(multiple.length, 2);
assert.deepEqual(
  multiple.map((violation) => violation.code).sort(),
  ["RUN_LEDGER_PRIVATE_SYMBOL", "RUN_LEDGER_TABLE_NAME"],
);

console.log("Run ledger public confidentiality fixtures passed.");
