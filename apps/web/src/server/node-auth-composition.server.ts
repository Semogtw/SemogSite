import {
  isEncodedPasswordHash,
  LocalAuthProvider,
} from "@semogtw/auth";
import { parseRuntimeConfig } from "@semogtw/config";
import { SqliteAuthSessionStore } from "@semogtw/database";
import { configureWebAuth, getWebAuthProvider } from "./auth-runtime";
import { getNodeDatabase } from "./node-database.server";

const sessionLifetimeMs = 14 * 24 * 60 * 60 * 1000;
let configurationAttempt: Promise<boolean> | null = null;

async function configureNodeAuth(): Promise<boolean> {
  if (getWebAuthProvider() !== null) return true;

  try {
    const config = parseRuntimeConfig(process.env);
    if (!isEncodedPasswordHash(config.ownerPasswordHash)) return false;

    const database = await getNodeDatabase();
    if (database === null) return false;

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
