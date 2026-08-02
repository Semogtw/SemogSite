import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { copyDatabaseMigrations } from "./database-migration-assets";

describe("copyDatabaseMigrations", () => {
  it("copies only ordered SQL migrations and removes stale output", () => {
    const root = mkdtempSync(join(tmpdir(), "semogtw-web-migrations-"));
    const source = join(root, "source");
    const target = join(root, "target");
    mkdirSync(source);
    mkdirSync(target);
    writeFileSync(join(source, "0002_second.sql"), "SELECT 2;\n");
    writeFileSync(join(source, "0001_first.sql"), "SELECT 1;\n");
    writeFileSync(join(source, "README.md"), "ignored\n");
    writeFileSync(join(target, "stale.sql"), "stale\n");

    try {
      expect(copyDatabaseMigrations(source, target)).toEqual([
        "0001_first.sql",
        "0002_second.sql",
      ]);
      expect(readdirSync(target)).toEqual([
        "0001_first.sql",
        "0002_second.sql",
      ]);
      expect(readFileSync(join(target, "0001_first.sql"), "utf8")).toBe(
        "SELECT 1;\n",
      );
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("fails when no migrations are available", () => {
    const root = mkdtempSync(join(tmpdir(), "semogtw-web-migrations-empty-"));
    const source = join(root, "source");
    const target = join(root, "target");
    mkdirSync(source);

    try {
      expect(() => copyDatabaseMigrations(source, target)).toThrow(
        "DATABASE_MIGRATIONS_NOT_FOUND",
      );
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
