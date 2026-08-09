import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const apiRoot = dirname(fileURLToPath(new URL("../package.json", import.meta.url)));

function source(relativePath: string): string {
  return readFileSync(join(apiRoot, "src", relativePath), "utf8");
}

describe("private capability Worker boundary", () => {
  it.each([
    "private-capabilities.ts",
    "private-capability-registry.ts",
    "routes/private/capabilities.ts",
  ])("keeps %s runtime-neutral", (relativePath) => {
    const content = source(relativePath);
    expect(content).not.toContain('from "node:');
    expect(content).not.toContain("from 'node:");
    expect(content).not.toContain("better-sqlite3");
    expect(content).not.toContain('from "@semogtw/database"');
    expect(content).not.toContain("@hono/node-server");
  });

  it("does not expose an external-effect mutation in the registry", () => {
    const registry = source("private-capability-registry.ts");
    expect(registry).not.toMatch(/externalEffect:\s*true/u);
  });

  it("keeps capability discovery private and no-store", () => {
    const app = source("app.ts");
    const route = source("routes/private/capabilities.ts");
    expect(app).toContain('"/api/v1/private/capabilities"');
    expect(route).toContain('"cache-control", "no-store, private"');
  });
});
