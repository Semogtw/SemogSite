import Database from "better-sqlite3";
import { drizzle, type BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import * as schema from "../schema";

export type SqliteDatabase = BetterSQLite3Database<typeof schema> & {
  $client: Database.Database;
};

export function createSqliteDatabase(path: string): SqliteDatabase {
  const client = new Database(path);
  client.pragma("foreign_keys = ON");
  client.pragma("busy_timeout = 5000");
  if (path !== ":memory:") client.pragma("journal_mode = WAL");
  return drizzle(client, { schema }) as SqliteDatabase;
}

export function migrate(
  database: SqliteDatabase,
  migrationsDirectory = fileURLToPath(new URL("../../migrations/", import.meta.url)),
): void {
  const client = database.$client;
  client.exec(`
    CREATE TABLE IF NOT EXISTS _semogtw_migrations (
      name TEXT PRIMARY KEY,
      applied_at TEXT NOT NULL
    );
  `);

  const applied = new Set(
    client
      .prepare("SELECT name FROM _semogtw_migrations")
      .all()
      .map((row) => (row as { name: string }).name),
  );
  const files = readdirSync(migrationsDirectory)
    .filter((name) => /^\d+.*\.sql$/u.test(name))
    .sort((left, right) => left.localeCompare(right));

  const apply = client.transaction((name: string, sql: string) => {
    client.exec(sql);
    client
      .prepare(
        "INSERT INTO _semogtw_migrations (name, applied_at) VALUES (?, ?)",
      )
      .run(name, new Date().toISOString());
  });

  for (const name of files) {
    if (applied.has(name)) continue;
    apply(name, readFileSync(`${migrationsDirectory}/${name}`, "utf8"));
  }
}
