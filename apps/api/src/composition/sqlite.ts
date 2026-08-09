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
  SqliteAuthSessionStore,
  SqliteAuditDataSource,
  SqliteEvidenceWriteRepository,
  SqliteOverviewDataSource,
  SqliteProjectDataSource,
  SqlitePublicProjectSource,
  SqliteRoadmapDataSource,
  SqliteTodayDataSource,
  SqliteWorkflowOrchestrationReadModel,
} from "@semogtw/database";
import {
  AttentionCaptureService,
  EvidenceService,
  OverviewService,
  ProjectService,
  RoadmapService,
  TodayService,
} from "@semogtw/domain";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { createApiApp } from "../app";

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
  const privateEvidence = new EvidenceService(
    new SqliteEvidenceWriteRepository(database),
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
  const app = createApiApp({
    ...(auth === undefined ? {} : { auth }),
    readiness,
    publicProjects: {
      list: () => publicSource.listListed(),
      findBySlug: (slug) => publicSource.findPublishableBySlug(slug),
    },
    privateAttention,
    privateEvidence,
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
