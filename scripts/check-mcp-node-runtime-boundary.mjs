import {
  existsSync,
  readFileSync,
  readdirSync,
  statSync,
} from "node:fs";
import { isBuiltin } from "node:module";
import { fileURLToPath } from "node:url";
import { join, relative, resolve } from "node:path";

const sourceExtension = /\.(?:c|m)?(?:j|t)sx?$/u;
const ignoredDirectories = new Set([
  "node_modules",
  "dist",
  "coverage",
]);
const importSpecifierPattern =
  /(?:from\s+|import\s*(?:\(\s*)?|require\s*\(\s*)["']([^"']+)["']/gu;

function collectSourceFiles(directory) {
  if (!existsSync(directory)) return [];

  const files = [];
  for (const entry of readdirSync(directory)) {
    if (ignoredDirectories.has(entry)) continue;
    const absolute = join(directory, entry);
    const stats = statSync(absolute);
    if (stats.isDirectory()) files.push(...collectSourceFiles(absolute));
    else if (stats.isFile() && sourceExtension.test(entry)) files.push(absolute);
  }
  return files;
}

function importedSpecifiers(content) {
  return [...content.matchAll(importSpecifierPattern)].map(
    (match) => match[1],
  );
}

export function scanMcpNodeRuntimeBoundary(root = process.cwd()) {
  const absoluteRoot = resolve(root);
  const sourceRoot = join(absoluteRoot, "packages/mcp");
  const violations = [];

  for (const absolutePath of collectSourceFiles(sourceRoot)) {
    const content = readFileSync(absolutePath, "utf8");
    const path = relative(absoluteRoot, absolutePath).replaceAll("\\", "/");

    for (const specifier of importedSpecifiers(content)) {
      if (!specifier || !isBuiltin(specifier)) continue;
      violations.push({
        code: "MCP_NODE_RUNTIME_IMPORT",
        path,
        specifier,
        message:
          "The transport-free MCP package must not depend on Node built-in modules.",
      });
    }
  }

  return violations.sort(
    (left, right) =>
      left.path.localeCompare(right.path) ||
      left.specifier.localeCompare(right.specifier),
  );
}

const executedPath = process.argv[1] ? resolve(process.argv[1]) : null;
if (executedPath === fileURLToPath(import.meta.url)) {
  const violations = scanMcpNodeRuntimeBoundary();
  if (violations.length === 0) {
    console.log("MCP Node runtime boundary passed.");
  } else {
    for (const violation of violations) {
      console.error(
        `${violation.code}: ${violation.path}: ${violation.specifier}: ${violation.message}`,
      );
    }
    process.exitCode = 1;
  }
}
