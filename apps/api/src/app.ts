import type { AuthProvider } from "@semogtw/auth";
import { Hono } from "hono";
import { createPrivateAuthMiddleware } from "./middleware/auth";
import { requireSameBrowserOrigin } from "./middleware/browser-origin";
import {
  sanitizedErrorHandler,
  sanitizedNotFoundHandler,
} from "./middleware/error-handler";
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
  createPrivateAuditRoutes,
  type PrivateAuditQueries,
} from "./routes/private/audit";
import {
  createPrivateOverviewRoutes,
  type PrivateOverviewQueries,
} from "./routes/private/overview";
import {
  createPrivateProjectRoutes,
  type PrivateProjectQueries,
} from "./routes/private/projects";
import {
  createPrivateRoadmapRoutes,
  type PrivateRoadmapQueries,
} from "./routes/private/roadmap";
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
  readiness?: ApiReadinessProbe;
  publicProjects?: PublicProjectQueries;
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
