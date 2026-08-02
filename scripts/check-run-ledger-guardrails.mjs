import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const checks = [
  "scripts/check-run-ledger-confidentiality.test.mjs",
  "scripts/check-run-ledger-schema.test.mjs",
  "scripts/check-run-ledger-confidentiality.mjs",
  "scripts/check-run-ledger-schema.mjs",
];

for (const relativePath of checks) {
  const absolutePath = join(root, relativePath);
  if (!existsSync(absolutePath)) {
    console.error(`RUN_LEDGER_GUARDRAIL_MISSING: ${relativePath}`);
    process.exit(1);
  }

  const result = spawnSync(process.execPath, [absolutePath], {
    cwd: root,
    encoding: "utf8",
    stdio: "pipe",
  });
  if (result.stdout.trim().length > 0) process.stdout.write(result.stdout);
  if (result.stderr.trim().length > 0) process.stderr.write(result.stderr);
  if (result.status !== 0) {
    console.error(
      `RUN_LEDGER_GUARDRAIL_FAILED: ${relativePath} (exit ${result.status ?? "unknown"})`,
    );
    process.exit(result.status ?? 1);
  }
}

console.log(`Run ledger guardrails passed (${checks.length} checks).`);
