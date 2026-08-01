import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { scanMcpTransportBoundary } from "./check-mcp-transport-boundary.mjs";

function scan(path, content) {
  const root = mkdtempSync(join(tmpdir(), "semogtw-mcp-cross-surface-"));
  const absolute = join(root, path);
  mkdirSync(dirname(absolute), { recursive: true });
  writeFileSync(absolute, content, "utf8");
  try {
    return scanMcpTransportBoundary(root);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

for (const [path, content] of [
  [
    "apps/web/src/server/hidden-mcp.ts",
    'import { createSemogtwMcpServer } from "@semogtw/mcp";\nvoid createSemogtwMcpServer;\n',
  ],
  [
    "apps/api/src/routes/mcp.ts",
    'import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";\nvoid McpServer;\n',
  ],
  [
    "apps/web/src/routes/devos.mcp.ts",
    'const adapter = await import("../../../mcp/src/index");\nvoid adapter;\n',
  ],
  [
    "apps/api/src/routes/mcp.cjs",
    'const adapter = require("@semogtw/mcp");\nvoid adapter;\n',
  ],
]) {
  const violations = scan(path, content);
  assert.equal(violations.length, 1, path);
  assert.equal(violations[0]?.code, "MCP_CROSS_SURFACE_IMPORT", path);
  assert.equal(violations[0]?.path, path, path);
}

assert.deepEqual(
  scan(
    "apps/web/src/server/ordinary.ts",
    'import { OverviewService } from "@semogtw/domain";\nvoid OverviewService;\n',
  ),
  [],
);

console.log("MCP cross-surface import boundary passed.");
