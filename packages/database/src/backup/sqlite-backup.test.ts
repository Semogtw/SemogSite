import { afterEach, describe, expect, it } from "vitest";
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createSqliteDatabase, migrate } from "../adapters/sqlite";
import {
  createVerifiedSqliteBackup,
  verifySqliteBackup,
} from "./sqlite-backup";

const temporaryDirectories: string[] = [];

function temporaryDirectory(): string {
  const directory = mkdtempSync(join(tmpdir(), "semogtw-backup-"));
  temporaryDirectories.push(directory);
  return directory;
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe("SQLite backup", () => {
  it("creates a verified snapshot with matching migration state", async () => {
    const database = createSqliteDatabase(":memory:");
    migrate(database);
    database.$client
      .prepare("UPDATE projects SET focus = ? WHERE id = ?")
      .run("Estado alterado antes do backup.", "demo-project-platform");
    const destination = join(temporaryDirectory(), "nested", "backup.sqlite");

    const result = await createVerifiedSqliteBackup(database, destination);
    database.$client.close();

    expect(existsSync(destination)).toBe(true);
    expect(result).toMatchObject({
      destination,
      integrity: "ok",
      foreignKeyViolations: 0,
      remainingPages: 0,
      migrations: ["0001_foundation.sql", "0002_seed_demo.sql"],
    });
    expect(result.sizeBytes).toBeGreaterThan(0);

    const verification = verifySqliteBackup(destination, result.migrations);
    expect(verification).toMatchObject({
      destination,
      integrity: "ok",
      foreignKeyViolations: 0,
      migrations: result.migrations,
    });

    const restored = createSqliteDatabase(destination);
    expect(
      restored.$client
        .prepare("SELECT focus FROM projects WHERE id = ?")
        .get("demo-project-platform"),
    ).toEqual({ focus: "Estado alterado antes do backup." });
    restored.$client.close();
  });

  it("refuses to overwrite an existing destination", async () => {
    const database = createSqliteDatabase(":memory:");
    migrate(database);
    const destination = join(temporaryDirectory(), "backup.sqlite");
    writeFileSync(destination, "sentinel", "utf8");

    await expect(
      createVerifiedSqliteBackup(database, destination),
    ).rejects.toThrow("BACKUP_DESTINATION_EXISTS");
    expect(readFileSync(destination, "utf8")).toBe("sentinel");
    database.$client.close();
  });

  it("rejects a backup whose migration state differs from the expectation", () => {
    const path = join(temporaryDirectory(), "other.sqlite");
    const database = createSqliteDatabase(path);
    migrate(database);
    database.$client
      .prepare("DELETE FROM _semogtw_migrations WHERE name = ?")
      .run("0002_seed_demo.sql");
    database.$client.close();

    expect(() =>
      verifySqliteBackup(path, [
        "0001_foundation.sql",
        "0002_seed_demo.sql",
      ]),
    ).toThrow("BACKUP_MIGRATION_MISMATCH");
  });
});
