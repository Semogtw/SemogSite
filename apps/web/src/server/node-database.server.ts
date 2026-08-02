import { parseDatabaseConfig } from "@semogtw/config";
import {
  createSqliteDatabase,
  migrate,
  type SqliteDatabase,
} from "@semogtw/database";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";

let databaseAttempt: Promise<SqliteDatabase | null> | null = null;
let databaseInstance: SqliteDatabase | null = null;

function ensureDatabaseDirectory(databaseUrl: string): string {
  if (databaseUrl === ":memory:") return databaseUrl;
  const absolutePath = resolve(databaseUrl);
  mkdirSync(dirname(absolutePath), { recursive: true });
  return absolutePath;
}

async function configureNodeDatabase(): Promise<SqliteDatabase | null> {
  if (databaseInstance !== null) return databaseInstance;

  let candidate: SqliteDatabase | null = null;
  try {
    const config = parseDatabaseConfig(process.env);
    candidate = createSqliteDatabase(
      ensureDatabaseDirectory(config.databaseUrl),
    );
    migrate(candidate);
    databaseInstance = candidate;
    return candidate;
  } catch {
    candidate?.$client.close();
    databaseInstance = null;
    return null;
  }
}

export async function getNodeDatabase(): Promise<SqliteDatabase | null> {
  databaseAttempt ??= configureNodeDatabase();
  return databaseAttempt;
}

export function resetNodeDatabaseForTests(): void {
  databaseInstance?.$client.close();
  databaseInstance = null;
  databaseAttempt = null;
}
