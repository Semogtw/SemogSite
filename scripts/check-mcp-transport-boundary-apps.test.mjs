import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { scanMcpTransportBoundary } from "./check-mcp-transport-boundary.mjs";

const root = mkdtempSync(join(tmpdir(), "semogtw-mcp-app-boundary-"));
const path = "apps/mcp-http/src/server.ts";
const absolute = join(root, path);
mkdirSync(dirname(absolute), { recursive: true });
writeFileSync(
  absolute,
  'import { createServer } from "node:http";\ncreateServer().listen(3000);\n',
  "utf8",
);

try {
  const violations = scanMcpTransportBoundary(root);
  assert.deepEqual(violations, [
    {
      code: "MCP_NETWORK_LISTENER",
      path,
      message:
        "MCP packages must remain listener-free; network composition belongs to a separately reviewed adapter.",
    },
  ]);
} finally {
  rmSync(root, { recursive: true, force: true });
}

console.log("Future MCP app namespace boundary passed.");
