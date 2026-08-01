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
  ".output",
  ".tanstack",
]);

const transportImportPattern =
  /@modelcontextprotocol\/sdk\/server\/(?:stdio|streamableHttp|sse)(?:\.js)?|\b(?:StdioServerTransport|StreamableHTTPServerTransport|SSEServerTransport)\b/u;
const networkImportPattern =
  /(?:from\s+|import\s*(?:\(\s*)?|require\s*\(\s*)["'](?:(?:node:)?(?:http|https|net|tls)|express|hono|@hono\/[^"']+)["']/u;
const listenerPattern = /\.listen\s*\(|\bserve\s*\(/u;

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

function mcpSourceRoots(absoluteRoot) {
  const roots = [join(absoluteRoot, "packages/mcp")];
  const appsRoot = join(absoluteRoot, "apps");
  if (!existsSync(appsRoot)) return roots;

  for (const entry of readdirSync(appsRoot)) {
    if (entry !== "mcp" && !entry.startsWith("mcp-")) continue;
    const absolute = join(appsRoot, entry);
    if (statSync(absolute).isDirectory()) roots.push(absolute);
  }
  return roots;
}

export function scanMcpTransportBoundary(root = process.cwd()) {
  const absoluteRoot = resolve(root);
  const violations = [];

  for (const sourceRoot of mcpSourceRoots(absoluteRoot)) {
    for (const absolutePath of collectSourceFiles(sourceRoot)) {
      const content = readFileSync(absolutePath, "utf8");
      const path = relative(absoluteRoot, absolutePath).replaceAll("\\", "/");

      if (transportImportPattern.test(content)) {
        violations.push({
          code: "MCP_TRANSPORT_IMPORT",
          path,
          message:
            "MCP transport imports are forbidden until an authenticated transport plan is approved.",
        });
        continue;
      }

      if (networkImportPattern.test(content) || listenerPattern.test(content)) {
        violations.push({
          code: "MCP_NETWORK_LISTENER",
          path,
          message:
            "MCP packages must remain listener-free; network composition belongs to a separately reviewed adapter.",
        });
      }
    }
  }

  return violations.sort((left, right) => left.path.localeCompare(right.path));
}

const executedPath = process.argv[1] ? resolve(process.argv[1]) : null;
if (executedPath === fileURLToPath(import.meta.url)) {
  const violations = scanMcpTransportBoundary();
  if (violations.length === 0) {
    console.log("MCP transport boundary passed.");
  } else {
    for (const violation of violations) {
      console.error(`${violation.code}: ${violation.path}: ${violation.message}`);
    }
    process.exitCode = 1;
  }
}
