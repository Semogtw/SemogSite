import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { scanMcpPackageBoundaries } from "./check-mcp-package-boundaries.mjs";

function scan(files) {
  const root = mkdtempSync(join(tmpdir(), "semogtw-mcp-package-boundary-"));
  for (const [path, content] of Object.entries(files)) {
    const absolute = join(root, path);
    mkdirSync(dirname(absolute), { recursive: true });
    writeFileSync(absolute, content, "utf8");
  }
  try {
    return scanMcpPackageBoundaries(root);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

assert.deepEqual(
  scan({
    "packages/mcp/src/server.ts": [
      'import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";',
      'import type { DevOSOverview } from "@semogtw/domain";',
      'import { z } from "zod";',
      'import { catalog } from "./catalog";',
      "void McpServer; void z; void catalog;",
      "export type Value = DevOSOverview;",
    ].join("\n"),
  }),
  [],
);

for (const [label, importLine] of [
  ["database", 'import { migrate } from "@semogtw/database";'],
  ["auth", 'import { verify } from "@semogtw/auth";'],
  ["config", 'import { parse } from "@semogtw/config";'],
  ["UI", 'import { Button } from "@semogtw/ui";'],
  ["web app", 'import { loader } from "../../../apps/web/src/router";'],
  ["MCP app", 'import { compose } from "../../../apps/mcp/src/index";'],
  ["Node built-in", 'import { randomUUID } from "node:crypto";'],
  ["CommonJS built-in", 'const fs = require("fs");'],
  ["dynamic built-in", 'const path = await import("node:path");'],
]) {
  const violations = scan({
    "packages/mcp/src/forbidden.ts": `${importLine}\nvoid 0;\n`,
  });
  assert.equal(violations.length, 1, label);
  assert.equal(violations[0]?.code, "MCP_PACKAGE_BOUNDARY", label);
  assert.equal(violations[0]?.path, "packages/mcp/src/forbidden.ts", label);
}

console.log("MCP package dependency boundary passed.");
