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
import { D1AuditDataSource } from "@semogtw/database/d1-audit";
import { D1AttentionCaptureRepository } from "@semogtw/database/d1-attention-capture";
import { D1AttentionLifecycleRepository } from "@semogtw/database/d1-attention-lifecycle";
import { D1BranchRecommendationAcceptanceRepository } from "@semogtw/database/d1-branch-recommendation-acceptance";
import { D1CooperativeRunRegistrationRepository } from "@semogtw/database/d1-cooperative-run-registration";
import { D1CooperativeRunTransitionRepository } from "@semogtw/database/d1-cooperative-run-transition";
import { D1EvidenceWriteRepository } from "@semogtw/database/d1-evidence-write";
import { D1LoginRateLimiter } from "@semogtw/database/d1-login-rate-limiter";
import { D1ProjectDataSource } from "@semogtw/database/d1-projects";
import { D1RepositoryTargetLifecycleRepository } from "@semogtw/database/d1-repository-target-lifecycle";
import { D1RepositoryTargetRegistrationRepository } from "@semogtw/database/d1-repository-target-registration";
import { D1RoadmapDataSource } from "@semogtw/database/d1-roadmap";
import { D1SessionHandoffRepository } from "@semogtw/database/d1-session-handoff";
import { D1StageCompletionRepository } from "@semogtw/database/d1-stage-completion";
import { D1TodayDataSource } from "@semogtw/database/d1-today";
import { D1WorkflowOrchestrationReadModel } from "@semogtw/database/d1-workflows";
import { D1OverviewDataSource } from "@semogtw/database/d1-overview";
import { D1PublicProjectSource } from "@semogtw/database/d1-public-projects";
import {
  AttentionCaptureService,
  AttentionLifecycleService,
  BranchRecommendationAcceptanceService,
  CooperativeRunRegistrationService,
  CooperativeRunTransitionService,
  EvidenceService,
  OverviewService,
  ProjectService,
  RepositoryTargetLifecycleService,
  RepositoryTargetRegistrationService,
  RoadmapService,
  SessionHandoffService,
  StageCompletionService,
  TodayService,
} from "@semogtw/domain";
import { createApiApp } from "../app";
import {
  consoleRequestObserver,
  isRequestLoggingEnabled,
} from "../middleware/request-observer";

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

const runtimeCache = new WeakMap<
  D1DatabaseBinding,
  Map<string, Promise<D1ApiRuntime>>
>();

function configFingerprint(bindings: D1ApiBindings): string {
  return [
    bindings.NODE_ENV ?? "",
    bindings.SEMOGTW_OWNER_PASSWORD_HASH ?? "",
    bindings.SEMOGTW_SESSION_SECRET ?? "",
    isRequestLoggingEnabled(bindings.SEMOGTW_REQUEST_LOGGING)
      ? "logging:on"
      : "logging:off",
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
  const privateAudit = new D1AuditDataSource(database);
  const privateAttention = new AttentionCaptureService(
    new D1AttentionCaptureRepository(bindings.DB),
  );
  const privateAttentionLifecycle = new AttentionLifecycleService(
    new D1AttentionLifecycleRepository(bindings.DB),
  );
  const privateEvidence = new EvidenceService(
    new D1EvidenceWriteRepository(bindings.DB),
  );
  const privateSessionHandoffs = new SessionHandoffService(
    new D1SessionHandoffRepository(bindings.DB),
  );
  const privateStages = new StageCompletionService(
    new D1StageCompletionRepository(bindings.DB),
  );
  const privateRepositoryTargets = new RepositoryTargetLifecycleService(
    new D1RepositoryTargetLifecycleRepository(bindings.DB),
  );
  const privateRepositoryTargetRegistration =
    new RepositoryTargetRegistrationService(
      new D1RepositoryTargetRegistrationRepository(bindings.DB),
    );
  const privateBranchRecommendations = new BranchRecommendationAcceptanceService(
    new D1BranchRecommendationAcceptanceRepository(bindings.DB),
  );
  const privateCooperativeRuns = new CooperativeRunRegistrationService(
    new D1CooperativeRunRegistrationRepository(bindings.DB),
  );
  const privateCooperativeRunTransitions = new CooperativeRunTransitionService(
    new D1CooperativeRunTransitionRepository(bindings.DB),
  );
  const privateOverview = new OverviewService(
    new D1OverviewDataSource(database),
  );
  const privateToday = new TodayService(new D1TodayDataSource(database));
  const roadmap = new RoadmapService(new D1RoadmapDataSource(database));
  const projects = new ProjectService(new D1ProjectDataSource(database));
  const privateWorkflows = new D1WorkflowOrchestrationReadModel(database);
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
  const readiness = {
    check: async () => {
      if (auth === undefined) return false;
      try {
        const migrationMarker = await bindings.DB
          .prepare("SELECT COUNT(*) AS count FROM login_rate_limits")
          .first();
        return migrationMarker !== null;
      } catch {
        return false;
      }
    },
  };
  const requestObserver = isRequestLoggingEnabled(bindings.SEMOGTW_REQUEST_LOGGING)
    ? consoleRequestObserver
    : undefined;

  return {
    app: createApiApp({
      ...(auth === undefined ? {} : { auth }),
      ...(requestObserver === undefined ? {} : { requestObserver }),
      readiness,
      publicProjects: {
        list: () => publicProjects.listListed(),
        findBySlug: (slug) => publicProjects.findPublishableBySlug(slug),
      },
      privateAttention,
      privateAttentionLifecycle,
      privateEvidence,
      privateSessionHandoffs,
      privateStages,
      privateRepositoryTargets,
      privateRepositoryTargetRegistration,
      privateBranchRecommendations,
      privateCooperativeRuns,
      privateCooperativeRunTransitions,
      privateAudit,
      privateOverview,
      privateToday,
      privateRoadmap,
      privateProjects,
      privateWorkflows,
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
