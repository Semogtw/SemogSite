import type { AuthProvider } from "@semogtw/auth";
import { Hono } from "hono";
import { createPrivateAuthMiddleware } from "./middleware/auth";
import { requireSameBrowserOrigin } from "./middleware/browser-origin";
import { createPrivateCsrfMiddleware } from "./middleware/csrf";
import {
  sanitizedErrorHandler,
  sanitizedNotFoundHandler,
} from "./middleware/error-handler";
import {
  createRequestObserverMiddleware,
  type ApiRequestObserver,
} from "./middleware/request-observer";
import {
  requestContext,
  type ApiEnvironment,
} from "./middleware/request-context";
import { securityHeaders } from "./middleware/security-headers";
import {
  createAuthSessionRoutes,
  type ApiAuthDependencies,
} from "./routes/auth/session";
import {
  createPrivateAttentionLifecycleRoutes,
  type PrivateAttentionLifecycleCommands,
} from "./routes/private/attention-lifecycle";
import {
  createPrivateAttentionRoutes,
  type PrivateAttentionCommands,
} from "./routes/private/attention";
import {
  createPrivateAuditRoutes,
  type PrivateAuditQueries,
} from "./routes/private/audit";
import {
  createPrivateBranchRecommendationRoutes,
  type PrivateBranchRecommendationCommands,
} from "./routes/private/branch-recommendations";
import {
  createPrivateEvidenceRoutes,
  type PrivateEvidenceCommands,
} from "./routes/private/evidence";
import {
  createPrivateOverviewRoutes,
  type PrivateOverviewQueries,
} from "./routes/private/overview";
import {
  createPrivateProjectRoutes,
  type PrivateProjectQueries,
} from "./routes/private/projects";
import {
  createPrivateRepositoryTargetRegistrationRoutes,
  type PrivateRepositoryTargetRegistrationCommands,
} from "./routes/private/repository-target-registration";
import {
  createPrivateRepositoryTargetRoutes,
  type PrivateRepositoryTargetCommands,
} from "./routes/private/repository-targets";
import {
  createPrivateRoadmapRoutes,
  type PrivateRoadmapQueries,
} from "./routes/private/roadmap";
import {
  createPrivateSessionHandoffRoutes,
  type PrivateSessionHandoffCommands,
} from "./routes/private/session-handoffs";
import {
  createPrivateStageRoutes,
  type PrivateStageCommands,
} from "./routes/private/stages";
import {
  createPrivateTodayRoutes,
  type PrivateTodayQueries,
} from "./routes/private/today";
import {
  createPrivateWorkflowRoutes,
  type PrivateWorkflowQueries,
} from "./routes/private/workflows";
import {
  createPublicProjectRoutes,
  type PublicProjectQueries,
} from "./routes/public/projects";
import {
  createReadinessRoutes,
  type ApiReadinessProbe,
} from "./routes/readiness";

export type ApiDependencies = {
  auth?: ApiAuthDependencies;
  authProvider?: AuthProvider;
  requestObserver?: ApiRequestObserver;
  readiness?: ApiReadinessProbe;
  publicProjects?: PublicProjectQueries;
  privateAttention?: PrivateAttentionCommands;
  privateAttentionLifecycle?: PrivateAttentionLifecycleCommands;
  privateEvidence?: PrivateEvidenceCommands;
  privateSessionHandoffs?: PrivateSessionHandoffCommands;
  privateStages?: PrivateStageCommands;
  privateRepositoryTargets?: PrivateRepositoryTargetCommands;
  privateRepositoryTargetRegistration?: PrivateRepositoryTargetRegistrationCommands;
  privateBranchRecommendations?: PrivateBranchRecommendationCommands;
  privateOverview?: PrivateOverviewQueries;
  privateToday?: PrivateTodayQueries;
  privateRoadmap?: PrivateRoadmapQueries;
  privateProjects?: PrivateProjectQueries;
  privateAudit?: PrivateAuditQueries;
  privateWorkflows?: PrivateWorkflowQueries;
};

export function createApiApp(dependencies: ApiDependencies = {}) {
  const api = new Hono<ApiEnvironment>({ strict: false });

  api.use("*", requestContext);
  api.use("*", createRequestObserverMiddleware(dependencies.requestObserver));
  api.use("*", securityHeaders);
  api.onError(sanitizedErrorHandler);
  api.notFound(sanitizedNotFoundHandler);
  api.get("/health", (context) => {
    context.header("cache-control", "no-store");
    return context.json({
      ok: true,
      service: "semogtw-api",
    });
  });
  api.route("/ready", createReadinessRoutes(dependencies.readiness));
  api.route(
    "/api/v1/public/projects",
    createPublicProjectRoutes(dependencies.publicProjects),
  );
  api.use("/api/v1/auth/*", requireSameBrowserOrigin);
  api.route("/api/v1/auth", createAuthSessionRoutes(dependencies.auth));
  api.use("/api/v1/private/*", requireSameBrowserOrigin);
  api.use(
    "/api/v1/private/*",
    createPrivateAuthMiddleware(
      dependencies.auth?.provider ?? dependencies.authProvider,
    ),
  );
  api.use(
    "/api/v1/private/*",
    createPrivateCsrfMiddleware(dependencies.auth?.sessionSecret),
  );
  api.route(
    "/api/v1/private/attention",
    createPrivateAttentionRoutes(dependencies.privateAttention),
  );
  api.route(
    "/api/v1/private/attention",
    createPrivateAttentionLifecycleRoutes(dependencies.privateAttentionLifecycle),
  );
  api.route(
    "/api/v1/private/evidence",
    createPrivateEvidenceRoutes(dependencies.privateEvidence),
  );
  api.route(
    "/api/v1/private/session-handoffs",
    createPrivateSessionHandoffRoutes(dependencies.privateSessionHandoffs),
  );
  api.route(
    "/api/v1/private/stages",
    createPrivateStageRoutes(dependencies.privateStages),
  );
  api.route(
    "/api/v1/private/repository-targets",
    createPrivateRepositoryTargetRoutes(dependencies.privateRepositoryTargets),
  );
  api.route(
    "/api/v1/private/repository-targets",
    createPrivateRepositoryTargetRegistrationRoutes(
      dependencies.privateRepositoryTargetRegistration,
    ),
  );
  api.route(
    "/api/v1/private/branch-recommendations",
    createPrivateBranchRecommendationRoutes(
      dependencies.privateBranchRecommendations,
    ),
  );
  api.route(
    "/api/v1/private/audit",
    createPrivateAuditRoutes(dependencies.privateAudit),
  );
  api.route(
    "/api/v1/private/overview",
    createPrivateOverviewRoutes(dependencies.privateOverview),
  );
  api.route(
    "/api/v1/private/today",
    createPrivateTodayRoutes(dependencies.privateToday),
  );
  api.route(
    "/api/v1/private/roadmap",
    createPrivateRoadmapRoutes(dependencies.privateRoadmap),
  );
  api.route(
    "/api/v1/private/projects",
    createPrivateProjectRoutes(dependencies.privateProjects),
  );
  api.route(
    "/api/v1/private/workflows",
    createPrivateWorkflowRoutes(dependencies.privateWorkflows),
  );

  return api;
}

export const app = createApiApp();
export type ApiApp = typeof app;
