import type { AuthProvider } from "@semogtw/auth";
import { Hono } from "hono";
import { createPrivateAuthMiddleware } from "./middleware/auth";
import { sanitizedErrorHandler } from "./middleware/error-handler";
import {
  requestContext,
  type ApiEnvironment,
} from "./middleware/request-context";
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

export type ApiDependencies = {
  auth?: ApiAuthDependencies;
  authProvider?: AuthProvider;
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
  api.onError(sanitizedErrorHandler);
  api.get("/health", (context) =>
    context.json({
      ok: true,
      service: "semogtw-api",
    }),
  );
  api.route(
    "/api/v1/public/projects",
    createPublicProjectRoutes(dependencies.publicProjects),
  );
  api.route("/api/v1/auth", createAuthSessionRoutes(dependencies.auth));
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
