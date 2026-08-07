import {
  isEncodedPasswordHash,
  LocalAuthProvider,
  type AuthProvider,
  type RuntimeNodeEnv,
} from "@semogtw/auth";
import { parseRuntimeConfig } from "@semogtw/config";
import {
  createD1Database,
  type D1DatabaseBinding,
} from "@semogtw/database/d1";
import { D1AuthSessionStore } from "@semogtw/database/d1-auth-sessions";
import { D1LoginRateLimiter } from "@semogtw/database/d1-login-rate-limiter";
import { D1ProjectDataSource } from "@semogtw/database/d1-projects";
import { D1RoadmapDataSource } from "@semogtw/database/d1-roadmap";
import { D1TodayDataSource } from "@semogtw/database/d1-today";
import { D1OverviewDataSource } from "@semogtw/database/d1-overview";
import { D1PublicProjectSource } from "@semogtw/database/d1-public-projects";
import { OverviewService, ProjectService, RoadmapService, TodayService } from "@semogtw/domain";
import { createApiApp } from "../app";

const sessionLifetimeMs = 14 * 24 * 60 * 60 * 1000;

export type D1ApiBindings = {
  readonly DB: D1DatabaseBinding;
  readonly NODE_ENV?: string;
  readonly SEMOGTW_OWNER_PASSWORD_HASH?: string;
  readonly SEMOGTW_SESSION_SECRET?: string;
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

const runtimeCache = new WeakMap<
  D1DatabaseBinding,
  Map<string, Promise<D1ApiRuntime>>
>();

function configFingerprint(bindings: D1ApiBindings): string {
  return [
    bindings.NODE_ENV ?? "",
    bindings.SEMOGTW_OWNER_PASSWORD_HASH ?? "",
    bindings.SEMOGTW_SESSION_SECRET ?? "",
  ].join("\u0000");
}

async function composeAuth(
  bindings: D1ApiBindings,
): Promise<ComposedAuth | undefined> {
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

async function composeD1ApiRuntime(
  bindings: D1ApiBindings,
): Promise<D1ApiRuntime> {
  const database = createD1Database(bindings.DB);
  const publicProjects = new D1PublicProjectSource(database);
  const privateOverview = new OverviewService(
    new D1OverviewDataSource(database),
  );
  const privateToday = new TodayService(new D1TodayDataSource(database));
  const roadmap = new RoadmapService(new D1RoadmapDataSource(database));
  const projects = new ProjectService(new D1ProjectDataSource(database));
  const privateRoadmap = {
    getRoadmap: () =>
      roadmap.query({
        projectIds: [],
        states: [],
        areas: [],
        includeCompleted: true,
      }),
  };
  const privateProjects = {
    listPortfolio: () => projects.listOperationalPortfolio(),
    getProjectHub: (slug: string) => projects.getProjectHub(slug),
  };
  const auth = await composeAuth(bindings);

  return {
    app: createApiApp({
      ...(auth === undefined ? {} : { auth }),
      publicProjects: {
        list: () => publicProjects.listListed(),
        findBySlug: (slug) => publicProjects.findPublishableBySlug(slug),
      },
      privateOverview,
      privateToday,
      privateRoadmap,
      privateProjects,
    }),
    authProvider: auth?.provider,
  };
}

/**
 * Composes and memoizes the Worker runtime for one D1 binding and secret set.
 * Missing or invalid secrets keep private routes fail-closed while public
 * routes remain available. A new isolate/configuration creates a new runtime.
 */
export function createD1ApiRuntime(
  bindings: D1ApiBindings,
): Promise<D1ApiRuntime> {
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
