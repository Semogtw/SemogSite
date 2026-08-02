import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const targets = {
  migration: "packages/database/migrations/0005_cooperative_run_ledger.sql",
  schema: "packages/database/src/schema/runs.ts",
  schemaIndex: "packages/database/src/schema/index.ts",
};

const expectedTables = {
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

const expectedSchemaSymbols = [
  "cooperativeRuns",
  "cooperativeRunEvents",
  "cooperativeRunCheckpoints",
  "cooperativeRunCommands",
];

function readTarget(relativePath) {
  const absolutePath = join(root, relativePath);
  if (!existsSync(absolutePath)) {
    throw new Error(`RUN_LEDGER_SCHEMA_FILE_MISSING: ${relativePath}`);
  }
  return readFileSync(absolutePath, "utf8");
}

function tableBody(sql, table) {
  const pattern = new RegExp(
    `CREATE\\s+TABLE\\s+(?:IF\\s+NOT\\s+EXISTS\\s+)?${table}\\s*\\(([\\s\\S]*?)\\);`,
    "iu",
  );
  return pattern.exec(sql)?.[1] ?? null;
}

export function checkRunLedgerSchemaConsistency(baseRoot = root) {
  const originalRoot = root;
  const effectiveRoot = resolve(baseRoot);
  const read = (relativePath) => {
    const absolutePath = join(effectiveRoot, relativePath);
    if (!existsSync(absolutePath)) {
      return { ok: false, content: "", error: `RUN_LEDGER_SCHEMA_FILE_MISSING: ${relativePath}` };
    }
    return { ok: true, content: readFileSync(absolutePath, "utf8"), error: null };
  };

  const violations = [];
  const migrationResult = read(targets.migration);
  const schemaResult = read(targets.schema);
  const indexResult = read(targets.schemaIndex);
  for (const result of [migrationResult, schemaResult, indexResult]) {
    if (!result.ok && result.error !== null) violations.push(result.error);
  }
  if (violations.length > 0) return violations;

  const migration = migrationResult.content;
  for (const [table, columns] of Object.entries(expectedTables)) {
    const body = tableBody(migration, table);
    if (body === null) {
      violations.push(`RUN_LEDGER_TABLE_MISSING: ${table}`);
      continue;
    }
    for (const column of columns) {
      if (!new RegExp(`\\b${column}\\b`, "u").test(body)) {
        violations.push(`RUN_LEDGER_COLUMN_MISSING: ${table}.${column}`);
      }
    }
    if (
      !new RegExp(
        `CREATE\\s+(?:UNIQUE\\s+)?INDEX[\\s\\S]*?ON\\s+${table}\\s*\\(`,
        "iu",
      ).test(migration)
    ) {
      violations.push(`RUN_LEDGER_INDEX_MISSING: ${table}`);
    }
  }

  const schema = schemaResult.content;
  for (const symbol of expectedSchemaSymbols) {
    if (!new RegExp(`export\\s+const\\s+${symbol}\\b`, "u").test(schema)) {
      violations.push(`RUN_LEDGER_SCHEMA_SYMBOL_MISSING: ${symbol}`);
    }
  }

  const schemaIndex = indexResult.content;
  if (!/(?:export\s+\*\s+from|from)\s+["']\.\/runs["']/u.test(schemaIndex)) {
    violations.push("RUN_LEDGER_SCHEMA_INDEX_EXPORT_MISSING: ./runs");
  }

  void originalRoot;
  return violations.sort();
}

const executedPath = process.argv[1] ? resolve(process.argv[1]) : null;
if (executedPath === fileURLToPath(import.meta.url)) {
  const violations = checkRunLedgerSchemaConsistency();
  if (violations.length === 0) {
    console.log("Run ledger schema consistency passed.");
  } else {
    for (const violation of violations) console.error(violation);
    process.exitCode = 1;
  }
}
