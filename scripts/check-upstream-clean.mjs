import { readFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

export const forbiddenMarkers = [
  "Julia",
  "PDI Julia",
  "Plano de Desenvolvimento Individual",
  "pdi_session",
  "ADMIN_PASSWORD",
];

const scanRoots = ["apps/", "packages/", "public/", "migrations/"];
const scanRootFiles = new Set([
  "package.json",
  "pnpm-workspace.yaml",
  "vite.config.ts",
  "vitest.workspace.ts",
]);
const excludedFiles = new Set([
  "scripts/check-upstream-clean.mjs",
  "scripts/check-upstream-clean.test.mjs",
  "docs/UPSTREAM_REFERENCE.md",
  "THIRD_PARTY_NOTICES.md",
]);

export function scanText(text) {
  return forbiddenMarkers.filter((marker) => text.includes(marker));
}

export function shouldScanPath(path) {
  if (excludedFiles.has(path)) return false;
  if (scanRootFiles.has(path)) return true;
  return scanRoots.some((root) => path.startsWith(root));
}

async function scanRepository() {
  const tracked = execFileSync("git", ["ls-files", "-z"], {
    encoding: "utf8",
  })
    .split("\0")
    .filter(Boolean)
    .filter(shouldScanPath);

  const violations = [];

  for (const path of tracked) {
    let content;
    try {
      content = await readFile(path, "utf8");
    } catch {
      continue;
    }

    const markers = scanText(content);
    if (markers.length > 0) violations.push({ path, markers });
  }

  if (violations.length > 0) {
    for (const violation of violations) {
      console.error(`${violation.path}: ${violation.markers.join(", ")}`);
    }
    process.exitCode = 1;
    return;
  }

  console.log(`Upstream clean check passed (${tracked.length} files scanned).`);
}

const isDirectExecution =
  process.argv[1] !== undefined &&
  fileURLToPath(import.meta.url) === process.argv[1];

if (isDirectExecution) await scanRepository();
