import {
  isEncodedPasswordHash,
  LocalAuthProvider,
} from "@semogtw/auth";
import { parseRuntimeConfig } from "@semogtw/config";
import {
  createSqliteDatabase,
  migrate,
  SqliteAuthSessionStore,
  type SqliteDatabase,
} from "@semogtw/database";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { configureWebAuth, getWebAuthProvider } from "./auth-runtime";

const sessionLifetimeMs = 14 * 24 * 60 * 60 * 1000;
let configurationAttempt: Promise<boolean> | null = null;
let databaseInstance: SqliteDatabase | null = null;

function ensureDatabaseDirectory(databaseUrl: string): string {
  if (databaseUrl === ":memory:") return databaseUrl;
  const absolutePath = resolve(databaseUrl);
  mkdirSync(dirname(absolutePath), { recursive: true });
  return absolutePath;
}

async function configureNodeAuth(): Promise<boolean> {
  if (getWebAuthProvider() !== null && databaseInstance !== null) return true;

  try {
    const config = parseRuntimeConfig(process.env);
    if (!isEncodedPasswordHash(config.ownerPasswordHash)) return false;

    const database = createSqliteDatabase(
      ensureDatabaseDirectory(config.databaseUrl),
    );
    migrate(database);

    const sessions = new SqliteAuthSessionStore(database);
    sessions.upsertOwnerAccount({
      id: "semogtw-owner",
      displayName: "Semogtw",
      passwordHash: config.ownerPasswordHash,
      now: new Date(),
    });

    configureWebAuth({
      authProvider: new LocalAuthProvider({
        ownerId: "semogtw-owner",
        encodedPasswordHash: config.ownerPasswordHash,
        sessions,
        sessionLifetimeMs,
      }),
      sessionSecret: config.sessionSecret,
    });
    databaseInstance = database;
    return true;
  } catch {
    databaseInstance?.$client.close();
    databaseInstance = null;
    return false;
  }
}

export async function ensureWebAuthConfigured(): Promise<boolean> {
  configurationAttempt ??= configureNodeAuth();
  return configurationAttempt;
}

export async function getNodeDatabase(): Promise<SqliteDatabase | null> {
  if (!(await ensureWebAuthConfigured())) return null;
  return databaseInstance;
}

export function resetNodeAuthCompositionForTests(): void {
  databaseInstance?.$client.close();
  databaseInstance = null;
  configurationAttempt = null;
}
