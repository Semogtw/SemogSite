import { LocalAuthProvider } from "@semogtw/auth";
import { parseRuntimeConfig } from "@semogtw/config";
import {
  createSqliteDatabase,
  migrate,
  SqliteAuthSessionStore,
} from "@semogtw/database";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { configureWebAuth, getWebAuthProvider } from "./auth-runtime";

let configurationAttempt: Promise<boolean> | null = null;

function ensureDatabaseDirectory(databaseUrl: string): string {
  if (databaseUrl === ":memory:") return databaseUrl;
  const absolutePath = resolve(databaseUrl);
  mkdirSync(dirname(absolutePath), { recursive: true });
  return absolutePath;
}

async function configureNodeAuth(): Promise<boolean> {
  if (getWebAuthProvider() !== null) return true;

  try {
    const config = parseRuntimeConfig(process.env);
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
      }),
      sessionSecret: config.sessionSecret,
    });
    return true;
  } catch {
    return false;
  }
}

export async function ensureWebAuthConfigured(): Promise<boolean> {
  configurationAttempt ??= configureNodeAuth();
  return configurationAttempt;
}

export function resetNodeAuthCompositionForTests(): void {
  configurationAttempt = null;
}
