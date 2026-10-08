import { isEncodedPasswordHash, LocalAuthProvider, type AuthProvider, type RuntimeNodeEnv } from "@semogtw/auth";
import { parseDatabaseConfig, parseRuntimeConfig } from "@semogtw/config";
import {
  createSqliteDatabase,
  migrate,
  SqliteAuthSessionStore,
  SqliteAuditDataSource,
  SqliteEditorialRedirectRepository,
  SqlitePublishedEditorialReadModel,
  SqlitePublicProjectSource,
} from "@semogtw/database";
import { EditorialRedirectService } from "@semogtw/domain";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { createApiApp } from "../app";
import { createPrivateRuntimeCapabilities } from "../private-capabilities";
import { consoleRequestObserver, isRequestLoggingEnabled } from "../middleware/request-observer";
import { createPublicEditorialRoutes } from "../routes/public/editorial";

const sessionLifetimeMs = 14 * 24 * 60 * 60 * 1000;
export type SqliteApiRuntime = {
  app: ReturnType<typeof createApiApp>;
  authProvider: AuthProvider | undefined;
  close(): void;
};

function resolveDatabasePath(databaseUrl: string): string {
  if (databaseUrl === ":memory:") return databaseUrl;
  const absolutePath = resolve(databaseUrl);
  mkdirSync(dirname(absolutePath), { recursive: true });
  return absolutePath;
}

type ComposedAuth = {
  provider: AuthProvider;
  sessionSecret: string;
  nodeEnv: RuntimeNodeEnv;
};

function composeAuth(env: Record<string, string | undefined>, database: ReturnType<typeof createSqliteDatabase>): ComposedAuth | undefined {
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
    return {
      provider: new LocalAuthProvider({
        ownerId: "semogtw-owner",
        encodedPasswordHash: config.ownerPasswordHash,
        sessions,
        sessionLifetimeMs,
      }),
      sessionSecret: config.sessionSecret,
      nodeEnv: config.nodeEnv,
    };
  } catch {
    return undefined;
  }
}

export function createSqliteApiRuntime(env: Record<string, string | undefined>): SqliteApiRuntime {
  const databaseConfig = parseDatabaseConfig(env);
  const database = createSqliteDatabase(resolveDatabasePath(databaseConfig.databaseUrl));
  migrate(database);

  const publicProjects = new SqlitePublicProjectSource(database);
  const publicEditorial = new SqlitePublishedEditorialReadModel(database);
  const privateAudit = new SqliteAuditDataSource(database);
  const privateEditorialRedirects = new EditorialRedirectService(
    new SqliteEditorialRedirectRepository(database),
  );
  const auth = composeAuth(env, database);
  const readiness = {
    check: () => {
      if (auth === undefined) return false;
      try {
        database.$client.prepare("SELECT COUNT(*) AS count FROM login_rate_limits").get();
        return true;
      } catch {
        return false;
      }
    },
  };
  const requestObserver = isRequestLoggingEnabled(env.SEMOGTW_REQUEST_LOGGING)
    ? consoleRequestObserver
    : undefined;

  const app = createApiApp({
    ...(auth === undefined ? {} : { auth }),
    ...(requestObserver === undefined ? {} : { requestObserver }),
    readiness,
    publicProjects: {
      list: () => publicProjects.listListed(),
      findBySlug: (slug) => publicProjects.findPublishableBySlug(slug),
    },
    privateAudit,
    privateCapabilities: { getCapabilities: () => createPrivateRuntimeCapabilities("node-sqlite") },
    privateEditorialRedirects,
  });
  app.route("/api/v1/public/editorial", createPublicEditorialRoutes(publicEditorial));
  return {
    app,
    authProvider: auth?.provider,
    close: () => database.$client.close(),
  };
}
