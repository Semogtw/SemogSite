import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { checkRunLedgerSchemaConsistency } from "./check-run-ledger-schema.mjs";

const tables = {
  cooperative_runs: [
    "id",
    "project_id",
    "title",
    "actor_label",
    "origin",
    "status",
    "progress",
    "summary",
    "next_action",
    "started_at",
    "last_heartbeat_at",
    "stale_after_seconds",
    "updated_at",
  ],
  cooperative_run_events: [
    "id",
    "run_id",
    "sequence",
    "kind",
    "actor",
    "source",
    "summary",
    "before_json",
    "after_json",
    "occurred_at",
    "idempotency_key",
    "correlation_id",
  ],
  cooperative_run_checkpoints: [
    "id",
    "run_id",
    "event_id",
    "sequence",
    "progress",
    "summary",
    "commits_json",
    "tests_status",
    "tests_summary",
    "blockers",
    "next_step",
    "captured_at",
  ],
  cooperative_run_commands: [
    "id",
    "run_id",
    "kind",
    "status",
    "summary",
    "payload_json",
    "queued_by",
    "idempotency_key",
    "correlation_id",
    "queued_at",
    "expires_at",
    "updated_at",
  ],
};

function fixture(overrides = {}) {
  const root = mkdtempSync(join(tmpdir(), "semogtw-run-schema-"));
  const migration = Object.entries(tables)
    .map(
      ([table, columns], index) =>
        `CREATE TABLE ${table} (\n${columns
          .map((column) => `  ${column} TEXT`)
          .join(",\n")}\n);\nCREATE INDEX run_index_${index} ON ${table} (${columns[0]});`,
    )
    .join("\n");
  const schema = [
    "export const cooperativeRuns = {};",
    "export const cooperativeRunEvents = {};",
    "export const cooperativeRunCheckpoints = {};",
    "export const cooperativeRunCommands = {};",
  ].join("\n");
  const files = {
    "packages/database/migrations/0005_cooperative_run_ledger.sql": migration,
    "packages/database/src/schema/runs.ts": schema,
    "packages/database/src/schema/index.ts": 'export * from "./runs";\n',
    ...overrides,
  };
  for (const [path, content] of Object.entries(files)) {
    const absolute = join(root, path);
    mkdirSync(dirname(absolute), { recursive: true });
    writeFileSync(absolute, content, "utf8");
  }
  return root;
}

function withFixture(overrides, callback) {
  const root = fixture(overrides);
  try {
    callback(root);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

withFixture({}, (root) => {
  assert.deepEqual(checkRunLedgerSchemaConsistency(root), []);
});

withFixture(
  {
    "packages/database/migrations/0005_cooperative_run_ledger.sql":
      "CREATE TABLE cooperative_runs (id TEXT);",
  },
  (root) => {
    const violations = checkRunLedgerSchemaConsistency(root);
    assert.ok(violations.includes("RUN_LEDGER_TABLE_MISSING: cooperative_run_events"));
    assert.ok(violations.includes("RUN_LEDGER_COLUMN_MISSING: cooperative_runs.project_id"));
    assert.ok(violations.includes("RUN_LEDGER_INDEX_MISSING: cooperative_runs"));
  },
);

withFixture(
  {
    "packages/database/src/schema/runs.ts":
      "export const cooperativeRuns = {};\n",
    "packages/database/src/schema/index.ts": "export const schema = {};\n",
  },
  (root) => {
    const violations = checkRunLedgerSchemaConsistency(root);
    assert.ok(
      violations.includes(
        "RUN_LEDGER_SCHEMA_SYMBOL_MISSING: cooperativeRunEvents",
      ),
    );
    assert.ok(
      violations.includes("RUN_LEDGER_SCHEMA_INDEX_EXPORT_MISSING: ./runs"),
    );
  },
);

const missingRoot = mkdtempSync(join(tmpdir(), "semogtw-run-schema-missing-"));
try {
  const violations = checkRunLedgerSchemaConsistency(missingRoot);
  assert.equal(violations.length, 3);
  assert.ok(
    violations.every((violation) =>
      violation.startsWith("RUN_LEDGER_SCHEMA_FILE_MISSING:"),
    ),
  );
} finally {
  rmSync(missingRoot, { recursive: true, force: true });
}

console.log("Run ledger schema consistency fixtures passed.");
