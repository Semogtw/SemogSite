import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

type PackageManifest = {
  dependencies?: Record<string, string>;
};

function readManifest(path: string): PackageManifest {
  return JSON.parse(readFileSync(path, "utf8")) as PackageManifest;
}

describe("web SSR runtime dependencies", () => {
  it("declares the native SQLite package externalized by the server bundle", () => {
    const web = readManifest(resolve(import.meta.dirname, "../../package.json"));
    const database = readManifest(
      resolve(import.meta.dirname, "../../../../packages/database/package.json"),
    );

    expect(web.dependencies?.["better-sqlite3"]).toBe(
      database.dependencies?.["better-sqlite3"],
    );
  });
});
