import {
  isEncodedPasswordHash,
  LocalAuthProvider,
  type AuthProvider,
  type RuntimeNodeEnv,
} from "@semogtw/auth";
import {
  parseDatabaseConfig,
  parseRuntimeConfig,
} from "@semogtw/config";
import {
  createSqliteDatabase,
  migrate,
  SqliteAttentionCaptureRepository,
  SqliteAttentionLifecycleRepository,
  SqliteAuthSessionStore,
  SqliteAuditDataSource,
  SqliteBranchRecommendationAcceptanceRepository,
  SqliteCooperativeRunRegistrationRepository,
  SqliteEvidenceWriteRepository,
  SqliteOverviewDataSource,
  SqliteProjectDataSource,
  SqlitePublicProjectSource,
  SqliteRepositoryTargetLifecycleRepository,
  SqliteRepositoryTargetRegistrationRepository,
  SqliteRoadmapDataSource,
  SqliteSessionHandoffRepository,
  SqliteStageCompletionRepository,
  SqliteTodayDataSource,
  SqliteWorkflowOrchestrationReadModel,
} from "@semogtw/database";
import {
  AttentionCaptureService,
  AttentionLifecycleService,
  BranchRecommendationAcceptanceService,
  CooperativeRunRegistrationService,
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
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { createApiApp } from "../app";
import {
  consoleRequestObserver,
  isRequestLoggingEnabled,
} from "../middleware/request-observer";

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

function composeAuth(
  env: Record<string, string | undefined>,
  database: ReturnType<typeof createSqliteDatabase>,
): ComposedAuth | undefined {
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

export function createSqliteApiRuntime(
  env: Record<string, string | undefined>,
): SqliteApiRuntime {
  const databaseConfig = parseDatabaseConfig(env);
  const database = createSqliteDatabase(
    resolveDatabasePath(databaseConfig.databaseUrl),
  );
  migrate(database);

  const publicSource = new SqlitePublicProjectSource(database);
  const privateAudit = new SqliteAuditDataSource(database);
  const privateAttention = new AttentionCaptureService(
    new SqliteAttentionCaptureRepository(database),
  );
  const privateAttentionLifecycle = new AttentionLifecycleService(
    new SqliteAttentionLifecycleRepository(database),
  );
  const privateEvidence = new EvidenceService(
    new SqliteEvidenceWriteRepository(database),
  );
  const privateSessionHandoffs = new SessionHandoffService(
    new SqliteSessionHandoffRepository(database),
  );
  const privateStages = new StageCompletionService(
    new SqliteStageCompletionRepository(database),
  );
  const privateRepositoryTargets = new RepositoryTargetLifecycleService(
    new SqliteRepositoryTargetLifecycleRepository(database),
  );
  const privateRepositoryTargetRegistration =
    new RepositoryTargetRegistrationService(
      new SqliteRepositoryTargetRegistrationRepository(database),
    );
  const privateBranchRecommendations = new BranchRecommendationAcceptanceService(
    new SqliteBranchRecommendationAcceptanceRepository(database),
  );
  const privateCooperativeRuns = new CooperativeRunRegistrationService(
    new SqliteCooperativeRunRegistrationRepository(database),
  );
  const overview = new OverviewService(
    new SqliteOverviewDataSource(database),
  );
  const today = new TodayService(new SqliteTodayDataSource(database));
  const roadmap = new RoadmapService(new SqliteRoadmapDataSource(database));
  const projects = new ProjectService(new SqliteProjectDataSource(database));
  const privateWorkflows = new SqliteWorkflowOrchestrationReadModel(database);
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
  const auth = composeAuth(env, database);
  const readiness = {
    check: () => {
      if (auth === undefined) return false;
      try {
        database.$client
          .prepare("SELECT COUNT(*) AS count FROM login_rate_limits")
          .get();
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
      list: () => publicSource.listListed(),
      findBySlug: (slug) => publicSource.findPublishableBySlug(slug),
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
    privateAudit,
    privateOverview: overview,
    privateToday: today,
    privateRoadmap,
    privateProjects,
    privateWorkflows,
  });

  return {
    app,
    authProvider: auth?.provider,
    close: () => database.$client.close(),
  };
}
