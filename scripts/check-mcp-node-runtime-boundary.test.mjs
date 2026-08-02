import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { scanMcpNodeRuntimeBoundary } from "./check-mcp-node-runtime-boundary.mjs";

function scan(content) {
  const root = mkdtempSync(join(tmpdir(), "semogtw-mcp-node-boundary-"));
  const path = join(root, "packages/mcp/src/module.ts");
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, content, "utf8");
  try {
    return scanMcpNodeRuntimeBoundary(root);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

assert.deepEqual(
  scan(
    [
      'import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";',
      'import type { DevOSOverview } from "@semogtw/domain";',
      'import { z } from "zod";',
      'import { catalog } from "./catalog";',
      "void McpServer; void z; void catalog;",
      "export type Value = DevOSOverview;",
    ].join("\n"),
  ),
  [],
);

for (const [label, content] of [
  ["node:test", 'import test from "node:test";'],
  ["node:sqlite", 'const sqlite = await import("node:sqlite");'],
  ["fs/promises", 'import { readFile } from "fs/promises";'],
  ["assert/strict", 'const assert = require("assert/strict");'],
  ["timers/promises", 'import { setTimeout } from "timers/promises";'],
  ["module", 'import { builtinModules } from "module";'],
]) {
  const violations = scan(content);
  assert.equal(violations.length, 1, label);
  assert.equal(violations[0]?.code, "MCP_NODE_RUNTIME_IMPORT", label);
  assert.equal(violations[0]?.specifier, label, label);
}

console.log("MCP Node runtime boundary passed.");
