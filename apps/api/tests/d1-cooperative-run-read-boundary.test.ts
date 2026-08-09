import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const d1CompositionPath = fileURLToPath(
  new URL("../src/composition/d1.ts", import.meta.url),
);
const sqliteCompositionPath = fileURLToPath(
  new URL("../src/composition/sqlite.ts", import.meta.url),
);
const databaseManifestPath = fileURLToPath(
  new URL("../../../packages/database/package.json", import.meta.url),
);

describe("cooperative run read runtime boundary", () => {
  it("uses the explicit Worker-safe D1 read-model subpath", () => {
    const composition = readFileSync(d1CompositionPath, "utf8");
    expect(composition).toContain(
      'from "@semogtw/database/d1-cooperative-run-read"',
    );
    expect(composition).not.toContain('from "@semogtw/database"');
  });

  it("keeps the Node composition on its explicit SQLite read-model subpath", () => {
    const composition = readFileSync(sqliteCompositionPath, "utf8");
    expect(composition).toContain(
      'from "@semogtw/database/sqlite-cooperative-run-read"',
    );
  });

  it("exports both runtime-specific read models explicitly", () => {
    const manifest = JSON.parse(
      readFileSync(databaseManifestPath, "utf8"),
    ) as { exports?: Record<string, string> };

    expect(manifest.exports?.["./d1-cooperative-run-read"]).toBe(
      "./src/repositories/d1-cooperative-run-read-model.ts",
    );
    expect(manifest.exports?.["./sqlite-cooperative-run-read"]).toBe(
      "./src/repositories/sqlite-cooperative-run-read-model.ts",
    );
  });
});
