import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  rmSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import type { Plugin, ResolvedConfig } from "vite";

const migrationPattern = /^\d+.*\.sql$/u;

export function copyDatabaseMigrations(
  sourceDirectory: string,
  targetDirectory: string,
): string[] {
  if (!existsSync(sourceDirectory)) {
    throw new Error("DATABASE_MIGRATIONS_NOT_FOUND");
  }

  const migrations = readdirSync(sourceDirectory)
    .filter((name) => migrationPattern.test(name))
    .sort((left, right) => left.localeCompare(right));
  if (migrations.length === 0) {
    throw new Error("DATABASE_MIGRATIONS_NOT_FOUND");
  }

  rmSync(targetDirectory, { recursive: true, force: true });
  mkdirSync(targetDirectory, { recursive: true });
  for (const migration of migrations) {
    copyFileSync(
      join(sourceDirectory, migration),
      join(targetDirectory, migration),
    );
  }
  return migrations;
}

export function databaseMigrationAssetsPlugin(): Plugin {
  const sourceDirectory = resolve(
    import.meta.dirname,
    "../../../../packages/database/migrations",
  );
  let targetDirectory: string | null = null;

  return {
    name: "semogtw-database-migration-assets",
    apply: "build",
    configResolved(config: ResolvedConfig) {
      targetDirectory = resolve(
        config.root,
        dirname(config.build.outDir),
        "migrations",
      );
    },
    closeBundle() {
      if (targetDirectory === null) {
        throw new Error("DATABASE_MIGRATION_OUTPUT_NOT_CONFIGURED");
      }
      copyDatabaseMigrations(sourceDirectory, targetDirectory);
    },
  };
}
