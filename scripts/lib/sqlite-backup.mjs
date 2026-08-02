import { createRequire } from "node:module";
import { existsSync, mkdirSync, rmSync, statSync } from "node:fs";
import { dirname } from "node:path";

const requireFromDatabasePackage = createRequire(
  new URL("../../packages/database/package.json", import.meta.url),
);
const Database = requireFromDatabasePackage("better-sqlite3");

function listMigrations(database) {
  return database
    .prepare("SELECT name FROM _semogtw_migrations ORDER BY name ASC")
    .all()
    .map((row) => row.name);
}

function sameStrings(left, right) {
  return (
    left.length === right.length &&
    left.every((value, index) => value === right[index])
  );
}

export function verifyBackupFile(destination, expectedMigrations) {
  if (!existsSync(destination)) throw new Error("BACKUP_NOT_FOUND");

  const database = new Database(destination, {
    readonly: true,
    fileMustExist: true,
  });
  try {
    const integrity = database
      .pragma("integrity_check")
      .flatMap((row) => Object.values(row))
      .filter((value) => typeof value === "string");
    if (integrity.length !== 1 || integrity[0].toLowerCase() !== "ok") {
      throw new Error("BACKUP_INTEGRITY_FAILED");
    }

    const foreignKeyViolations = database.pragma("foreign_key_check");
    if (foreignKeyViolations.length > 0) {
      throw new Error("BACKUP_FOREIGN_KEY_FAILED");
    }

    const migrations = listMigrations(database);
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
    database.close();
  }
}

export async function createBackupFile(source, destination) {
  if (!existsSync(source)) throw new Error("SOURCE_DATABASE_NOT_FOUND");
  if (existsSync(destination)) throw new Error("BACKUP_DESTINATION_EXISTS");

  mkdirSync(dirname(destination), { recursive: true });
  const database = new Database(source, {
    readonly: true,
    fileMustExist: true,
  });
  try {
    const expectedMigrations = listMigrations(database);
    const progress = await database.backup(destination);
    const verification = verifyBackupFile(destination, expectedMigrations);
    return {
      ...verification,
      totalPages: progress.totalPages,
      remainingPages: progress.remainingPages,
    };
  } catch (error) {
    rmSync(destination, { force: true });
    throw error;
  } finally {
    database.close();
  }
}

export function readMigrationState(source) {
  if (!existsSync(source)) throw new Error("SOURCE_DATABASE_NOT_FOUND");
  const database = new Database(source, {
    readonly: true,
    fileMustExist: true,
  });
  try {
    return listMigrations(database);
  } finally {
    database.close();
  }
}
