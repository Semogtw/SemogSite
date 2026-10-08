import {
  isEncodedPasswordHash,
  LocalAuthProvider,
  type AuthProvider,
  type RuntimeNodeEnv,
} from "@semogtw/auth";
import { parseRuntimeConfig } from "@semogtw/config";
import { createD1Database, type D1DatabaseBinding } from "@semogtw/database/d1";
import { D1AuthSessionStore } from "@semogtw/database/d1-auth-sessions";
import { D1AuditDataSource } from "@semogtw/database/d1-audit";
import { D1EditorialRedirectRepository } from "@semogtw/database/d1-editorial-redirects";
import { D1LoginRateLimiter } from "@semogtw/database/d1-login-rate-limiter";
import { D1PublishedEditorialReadModel } from "@semogtw/database/d1-published-editorial";
import { D1PublicProjectSource } from "@semogtw/database/d1-public-projects";
import { EditorialRedirectService } from "@semogtw/domain";
import { createApiApp } from "../app";
import { createPrivateRuntimeCapabilities } from "../private-capabilities";
import { consoleRequestObserver, isRequestLoggingEnabled } from "../middleware/request-observer";
import { createPublicEditorialRoutes } from "../routes/public/editorial";

const sessionLifetimeMs = 14 * 24 * 60 * 60 * 1000;

export type D1ApiBindings = {
  readonly DB: D1DatabaseBinding;
  readonly NODE_ENV?: string;
  readonly SEMOGTW_OWNER_PASSWORD_HASH?: string;
  readonly SEMOGTW_SESSION_SECRET?: string;
  readonly SEMOGTW_REQUEST_LOGGING?: string;
};

export type D1ApiRuntime = {
  readonly app: ReturnType<typeof createApiApp>;
  readonly authProvider: AuthProvider | undefined;
};

type ComposedAuth = {
  readonly provider: AuthProvider;
  readonly sessionSecret: string;
  readonly nodeEnv: RuntimeNodeEnv;
  readonly loginLimiter: D1LoginRateLimiter;
};

const runtimeCache = new WeakMap<D1DatabaseBinding, Map<string, Promise<D1ApiRuntime>>>();

function configFingerprint(bindings: D1ApiBindings): string {
  return [
    bindings.NODE_ENV ?? "",
    bindings.SEMOGTW_OWNER_PASSWORD_HASH ?? "",
    bindings.SEMOGTW_SESSION_SECRET ?? "",
    isRequestLoggingEnabled(bindings.SEMOGTW_REQUEST_LOGGING) ? "logging:on" : "logging:off",
  ].join("\u0000");
}

async function composeAuth(bindings: D1ApiBindings): Promise<ComposedAuth | undefined> {
  try {
    const config = parseRuntimeConfig({
      NODE_ENV: bindings.NODE_ENV,
      SEMOGTW_OWNER_PASSWORD_HASH: bindings.SEMOGTW_OWNER_PASSWORD_HASH,
      SEMOGTW_SESSION_SECRET: bindings.SEMOGTW_SESSION_SECRET,
    });
    if (!isEncodedPasswordHash(config.ownerPasswordHash)) return undefined;
    const sessions = new D1AuthSessionStore(bindings.DB);
    await sessions.upsertOwnerAccount({
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
      loginLimiter: new D1LoginRateLimiter(bindings.DB, {
        maxAttempts: 5,
        windowMs: 15 * 60 * 1000,
      }),
    };
  } catch {
    return undefined;
  }
}

async function composeD1ApiRuntime(bindings: D1ApiBindings): Promise<D1ApiRuntime> {
  const database = createD1Database(bindings.DB);
  const publicProjects = new D1PublicProjectSource(database);
  const publicEditorial = new D1PublishedEditorialReadModel(bindings.DB);
  const privateAudit = new D1AuditDataSource(database);
  const privateEditorialRedirects = new EditorialRedirectService(
    new D1EditorialRedirectRepository(bindings.DB),
  );
  const auth = await composeAuth(bindings);
  const readiness = {
    check: async () => {
      if (auth === undefined) return false;
      try {
        const marker = await bindings.DB.prepare("SELECT COUNT(*) AS count FROM login_rate_limits").first();
        return marker !== null;
      } catch {
        return false;
      }
    },
  };
  const requestObserver = isRequestLoggingEnabled(bindings.SEMOGTW_REQUEST_LOGGING)
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
    privateCapabilities: { getCapabilities: () => createPrivateRuntimeCapabilities("cloudflare-worker-d1") },
    privateEditorialRedirects,
  });
  app.route("/api/v1/public/editorial", createPublicEditorialRoutes(publicEditorial));
  return { app, authProvider: auth?.provider };
}

export function createD1ApiRuntime(bindings: D1ApiBindings): Promise<D1ApiRuntime> {
  const fingerprint = configFingerprint(bindings);
  let runtimes = runtimeCache.get(bindings.DB);
  if (runtimes === undefined) {
    runtimes = new Map();
    runtimeCache.set(bindings.DB, runtimes);
  }
  const existing = runtimes.get(fingerprint);
  if (existing !== undefined) return existing;
  const runtime = composeD1ApiRuntime(bindings);
  runtimes.set(fingerprint, runtime);
  return runtime;
}

export async function createD1ApiApp(bindings: D1ApiBindings) {
  return (await createD1ApiRuntime(bindings)).app;
}
