import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const compositionPath = fileURLToPath(
  new URL("../src/composition/d1.ts", import.meta.url),
);
const databaseManifestPath = fileURLToPath(
  new URL("../../../packages/database/package.json", import.meta.url),
);

describe("D1 cooperative run transition boundary", () => {
  it("uses the explicit Worker-safe database subpath", () => {
    const composition = readFileSync(compositionPath, "utf8");
    expect(composition).toContain(
      'from "@semogtw/database/d1-cooperative-run-transition"',
    );
    expect(composition).not.toContain('from "@semogtw/database"');
  });

  it("keeps the transition adapter exported without exposing the SQLite barrel", () => {
    const manifest = JSON.parse(
      readFileSync(databaseManifestPath, "utf8"),
    ) as { exports?: Record<string, string> };
    expect(manifest.exports?.["./d1-cooperative-run-transition"]).toBe(
      "./src/repositories/d1-cooperative-run-transition-repository.ts",
    );
  });
});
