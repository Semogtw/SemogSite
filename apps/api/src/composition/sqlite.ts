import {
  isEncodedPasswordHash,
  LocalAuthProvider,
  type AuthProvider,
} from "@semogtw/auth";
import {
  parseDatabaseConfig,
  parseRuntimeConfig,
} from "@semogtw/config";
import {
  createSqliteDatabase,
  migrate,
  SqliteAuthSessionStore,
  SqliteOverviewDataSource,
  SqlitePublicProjectSource,
} from "@semogtw/database";
import { OverviewService } from "@semogtw/domain";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { createApiApp } from "../app";

const sessionLifetimeMs = 14 * 24 * 60 * 60 * 1000;

function resolveDatabasePath(databaseUrl: string): string {
  if (databaseUrl === ":memory:") return databaseUrl;
  const absolutePath = resolve(databaseUrl);
  mkdirSync(dirname(absolutePath), { recursive: true });
  return absolutePath;
}

function composeAuthProvider(
  env: Record<string, string | undefined>,
  database: ReturnType<typeof createSqliteDatabase>,
): AuthProvider | undefined {
  try {
    const config = parseRuntimeConfig(env);
    if (!isEncodedPasswordHash(config.ownerPasswordHash)) return undefined;

    const sessions = new SqliteAuthSessionStore(database);
    sessions.upsertOwnerAccount({
      id: "semogtw-owner",
      displayName: "Semogtw",
      passwordHash: config.ownerPasswordHash,
      now: new Date(),
    });
    return new LocalAuthProvider({
      ownerId: "semogtw-owner",
      encodedPasswordHash: config.ownerPasswordHash,
      sessions,
      sessionLifetimeMs,
    });
  } catch {
    return undefined;
  }
}

export function createSqliteApiRuntime(
  env: Record<string, string | undefined>,
) {
  const databaseConfig = parseDatabaseConfig(env);
  const database = createSqliteDatabase(
    resolveDatabasePath(databaseConfig.databaseUrl),
  );
  migrate(database);

  const publicSource = new SqlitePublicProjectSource(database);
  const overview = new OverviewService(
    new SqliteOverviewDataSource(database),
  );
  const authProvider = composeAuthProvider(env, database);
  const app = createApiApp({
    ...(authProvider === undefined ? {} : { authProvider }),
    publicProjects: {
      list: () => publicSource.listListed(),
      findBySlug: (slug) => publicSource.findPublishableBySlug(slug),
    },
    privateOverview: overview,
  });

  return {
    app,
    authProvider,
    close: () => database.$client.close(),
  };
}
