import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { scanMcpTransportBoundary } from "./check-mcp-transport-boundary.mjs";

function fixture(files) {
  const root = mkdtempSync(join(tmpdir(), "semogtw-mcp-boundary-"));
  for (const [path, content] of Object.entries(files)) {
    const absolute = join(root, path);
    mkdirSync(join(absolute, ".."), { recursive: true });
    writeFileSync(absolute, content, "utf8");
  }
  return root;
}

const allowedRoot = fixture({
  "packages/mcp/src/server.ts":
    'import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";\nexport const server = new McpServer({ name: "x", version: "1" });\n',
  "packages/mcp/src/server.test.ts":
    'import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";\nvoid InMemoryTransport;\n',
  "apps/mcp/src/sqlite-server.ts":
    'export function createServer() { return { connect() {} }; }\n',
});
try {
  assert.deepEqual(scanMcpTransportBoundary(allowedRoot), []);
} finally {
  rmSync(allowedRoot, { recursive: true, force: true });
}

for (const [path, content, expected] of [
  [
    "packages/mcp/src/stdio.ts",
    'import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";\n',
    "MCP_TRANSPORT_IMPORT",
  ],
  [
    "apps/mcp/src/http.ts",
    'import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";\n',
    "MCP_TRANSPORT_IMPORT",
  ],
  [
    "apps/mcp/src/listener.ts",
    'import { createServer } from "node:http";\ncreateServer().listen(3000);\n',
    "MCP_NETWORK_LISTENER",
  ],
]) {
  const root = fixture({ [path]: content });
  try {
    const violations = scanMcpTransportBoundary(root);
    assert.equal(violations.length, 1);
    assert.equal(violations[0]?.code, expected);
    assert.equal(violations[0]?.path, path);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

console.log("MCP transport boundary guardrail fixtures passed.");
