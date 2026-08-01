import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { scanMcpTransportBoundary } from "./check-mcp-transport-boundary.mjs";

function scan(path, content) {
  const root = mkdtempSync(join(tmpdir(), "semogtw-mcp-imports-"));
  const absolute = join(root, path);
  mkdirSync(dirname(absolute), { recursive: true });
  writeFileSync(absolute, content, "utf8");
  try {
    return scanMcpTransportBoundary(root);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

for (const [label, content, code] of [
  ["side-effect Node import", 'import "node:http";\n', "MCP_NETWORK_LISTENER"],
  [
    "CommonJS Node require",
    'const http = require("node:http");\nvoid http;\n',
    "MCP_NETWORK_LISTENER",
  ],
  [
    "dynamic SDK transport import",
    'await import("@modelcontextprotocol/sdk/server/streamableHttp.js");\n',
    "MCP_TRANSPORT_IMPORT",
  ],
  ["side-effect framework import", 'import "hono";\n', "MCP_NETWORK_LISTENER"],
]) {
  const violations = scan("apps/mcp/src/forbidden.ts", content);
  assert.equal(violations.length, 1, label);
  assert.equal(violations[0]?.code, code, label);
}

console.log("MCP transport import variants passed.");
