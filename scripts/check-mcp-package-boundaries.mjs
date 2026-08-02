import {
  existsSync,
  readFileSync,
  readdirSync,
  statSync,
} from "node:fs";
import { fileURLToPath } from "node:url";
import { join, relative, resolve } from "node:path";

const sourceExtension = /\.(?:c|m)?(?:j|t)sx?$/u;
const ignoredDirectories = new Set([
  "node_modules",
  "dist",
  "coverage",
]);

const forbiddenImportPattern =
  /(?:from\s+|import\s*(?:\(\s*)?|require\s*\(\s*)["'](?:@semogtw\/(?:auth|config|contracts|database|github|ui|web|api|mcp-app)(?:\/[^"']*)?|(?:node:)?(?:assert|buffer|child_process|cluster|crypto|dgram|diagnostics_channel|dns|events|fs|http|http2|https|module|net|os|path|perf_hooks|process|querystring|readline|repl|stream|string_decoder|sys|timers|tls|trace_events|tty|url|util|v8|vm|wasi|worker_threads|zlib)|(?:\.\.\/)+(?:apps|packages\/(?:auth|config|contracts|database|github|ui))(?:\/[^"']*)?)["']/u;

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

export function scanMcpPackageBoundaries(root = process.cwd()) {
  const absoluteRoot = resolve(root);
  const sourceRoot = join(absoluteRoot, "packages/mcp");
  const violations = [];

  for (const absolutePath of collectSourceFiles(sourceRoot)) {
    const content = readFileSync(absolutePath, "utf8");
    if (!forbiddenImportPattern.test(content)) continue;

    const path = relative(absoluteRoot, absolutePath).replaceAll("\\", "/");
    violations.push({
      code: "MCP_PACKAGE_BOUNDARY",
      path,
      message:
        "The transport-free MCP package may depend only on the domain, MCP SDK, Zod and its own modules.",
    });
  }

  return violations.sort((left, right) => left.path.localeCompare(right.path));
}

const executedPath = process.argv[1] ? resolve(process.argv[1]) : null;
if (executedPath === fileURLToPath(import.meta.url)) {
  const violations = scanMcpPackageBoundaries();
  if (violations.length === 0) {
    console.log("MCP package dependency boundary passed.");
  } else {
    for (const violation of violations) {
      console.error(`${violation.code}: ${violation.path}: ${violation.message}`);
    }
    process.exitCode = 1;
  }
}
