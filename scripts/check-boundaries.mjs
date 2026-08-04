import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

export const domainForbiddenImports = [
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

export const applicationForbiddenImports = [
  "@tanstack/",
  "hono",
  "drizzle-",
  "better-sqlite3",
  "wrangler",
  "cloudflare:",
  "react",
  "@modelcontextprotocol/",
  "@semogtw/database",
  "@semogtw/mcp",
  "@semogtw/ui",
  "node:",
  "apps/",
  "packages/ui",
];

const importPattern =
  /(?:from\s+|import\s*\(|import\s+|require\s*\()\s*["']([^"']+)["']/g;

export function findBoundaryViolations(
  source,
  forbiddenImports = domainForbiddenImports,
) {
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

function trackedFiles(patterns) {
  return execFileSync("git", ["ls-files", ...patterns], { encoding: "utf8" })
    .split("\n")
    .filter(Boolean);
}

export async function collectBoundaryViolations() {
  const targets = [
    ...trackedFiles([
      "packages/domain/**/*.ts",
      "packages/domain/**/*.tsx",
      "packages/domain/**/*.js",
      "packages/domain/**/*.mjs",
    ]).map((path) => ({
      path,
      forbiddenImports: domainForbiddenImports,
      boundary: "domain",
    })),
    ...trackedFiles([
      "packages/application/src/**/*.ts",
      "packages/application/src/**/*.tsx",
      "packages/application/src/**/*.js",
      "packages/application/src/**/*.mjs",
    ])
      .filter((path) => !/\.(?:test|spec)\.[cm]?[jt]sx?$/u.test(path))
      .map((path) => ({
        path,
        forbiddenImports: applicationForbiddenImports,
        boundary: "application",
      })),
  ];

  const violations = [];
  for (const target of targets) {
    const source = await readFile(target.path, "utf8");
    for (const violation of findBoundaryViolations(
      source,
      target.forbiddenImports,
    )) {
      violations.push({
        path: target.path,
        boundary: target.boundary,
        ...violation,
      });
    }
  }
  return { targets, violations };
}

async function main() {
  const { targets, violations } = await collectBoundaryViolations();
  if (violations.length > 0) {
    for (const violation of violations) {
      console.error(
        `${violation.path}: forbidden ${violation.boundary} import ${violation.specifier} (matched ${violation.forbidden})`,
      );
    }
    process.exitCode = 1;
    return;
  }
  console.log(`Boundary check passed (${targets.length} files scanned).`);
}

const direct =
  process.argv[1] !== undefined &&
  fileURLToPath(import.meta.url) === process.argv[1];
if (direct) await main();
