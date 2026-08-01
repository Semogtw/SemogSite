import { readFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";

const forbiddenImports = [
  "@tanstack/",
  "hono",
  "drizzle-",
  "better-sqlite3",
  "wrangler",
  "cloudflare:",
  "react",
  "apps/",
  "packages/ui",
];

const importPattern = /(?:from\s+|import\s*\(|require\s*\()\s*["']([^"']+)["']/g;

export function findBoundaryViolations(source) {
  const violations = [];
  for (const match of source.matchAll(importPattern)) {
    const specifier = match[1];
    if (!specifier) continue;
    const forbidden = forbiddenImports.find(
      (entry) => specifier === entry || specifier.startsWith(entry),
    );
    if (forbidden) violations.push({ specifier, forbidden });
  }
  return violations;
}

const files = execFileSync(
  "git",
  ["ls-files", "packages/domain/**/*.ts", "packages/domain/**/*.tsx", "packages/domain/**/*.js", "packages/domain/**/*.mjs"],
  { encoding: "utf8" },
)
  .split("\n")
  .filter(Boolean);

const violations = [];
for (const path of files) {
  const source = await readFile(path, "utf8");
  for (const violation of findBoundaryViolations(source)) {
    violations.push({ path, ...violation });
  }
}

if (violations.length > 0) {
  for (const violation of violations) {
    console.error(
      `${violation.path}: forbidden import ${violation.specifier} (matched ${violation.forbidden})`,
    );
  }
  process.exitCode = 1;
} else {
  console.log(`Domain boundary check passed (${files.length} files scanned).`);
}
