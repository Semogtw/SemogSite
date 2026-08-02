import Database from "better-sqlite3";
import {
  existsSync,
  mkdirSync,
  rmSync,
  statSync,
} from "node:fs";
import { dirname } from "node:path";
import type { SqliteDatabase } from "../adapters/sqlite";

export type SqliteBackupVerification = {
  destination: string;
  integrity: "ok";
  foreignKeyViolations: 0;
  migrations: readonly string[];
  sizeBytes: number;
};

export type CreatedSqliteBackup = SqliteBackupVerification & {
  totalPages: number;
  remainingPages: 0;
};

function listMigrations(client: Database.Database): readonly string[] {
  return client
    .prepare("SELECT name FROM _semogtw_migrations ORDER BY name ASC")
    .all()
    .map((row) => (row as { name: string }).name);
}

function sameStrings(
  left: readonly string[],
  right: readonly string[],
): boolean {
  return (
    left.length === right.length &&
    left.every((value, index) => value === right[index])
  );
}

export function verifySqliteBackup(
  destination: string,
  expectedMigrations?: readonly string[],
): SqliteBackupVerification {
  if (!existsSync(destination)) throw new Error("BACKUP_NOT_FOUND");

  const client = new Database(destination, {
    readonly: true,
    fileMustExist: true,
  });
  try {
    const integrityRows = client.pragma("integrity_check") as Array<
      Record<string, unknown>
    >;
    const integrityMessages = integrityRows.flatMap((row) =>
      Object.values(row).filter((value): value is string => typeof value === "string"),
    );
    if (
      integrityMessages.length !== 1 ||
      integrityMessages[0]?.toLowerCase() !== "ok"
    ) {
      throw new Error("BACKUP_INTEGRITY_FAILED");
    }

    const foreignKeyRows = client.pragma("foreign_key_check") as Array<
      Record<string, unknown>
    >;
    if (foreignKeyRows.length > 0) {
      throw new Error("BACKUP_FOREIGN_KEY_FAILED");
    }

    const migrations = listMigrations(client);
    if (
      expectedMigrations !== undefined &&
      !sameStrings(migrations, [...expectedMigrations].sort())
    ) {
      throw new Error("BACKUP_MIGRATION_MISMATCH");
    }

    return {
      destination,
      integrity: "ok",
      foreignKeyViolations: 0,
      migrations,
      sizeBytes: statSync(destination).size,
    };
  } finally {
    client.close();
  }
}

export async function createVerifiedSqliteBackup(
  database: SqliteDatabase,
  destination: string,
): Promise<CreatedSqliteBackup> {
  if (existsSync(destination)) {
    throw new Error("BACKUP_DESTINATION_EXISTS");
  }

  mkdirSync(dirname(destination), { recursive: true });
  const expectedMigrations = listMigrations(database.$client);

  try {
    const progress = await database.$client.backup(destination);
    const verification = verifySqliteBackup(destination, expectedMigrations);
    return {
      ...verification,
      totalPages: progress.totalPages,
      remainingPages: 0,
    };
  } catch (error) {
    rmSync(destination, { force: true });
    throw error;
  }
}
