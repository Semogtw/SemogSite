import type { AuthProvider } from "@semogtw/auth";
import { Hono } from "hono";
import { createPrivateAuthMiddleware } from "./middleware/auth";
import { sanitizedErrorHandler } from "./middleware/error-handler";
import {
  requestContext,
  type ApiEnvironment,
} from "./middleware/request-context";
import {
  createPrivateOverviewRoutes,
  type PrivateOverviewQueries,
} from "./routes/private/overview";
import {
  createPublicProjectRoutes,
  type PublicProjectQueries,
} from "./routes/public/projects";

export type ApiDependencies = {
  authProvider?: AuthProvider;
  publicProjects?: PublicProjectQueries;
  privateOverview?: PrivateOverviewQueries;
};

export function createApiApp(dependencies: ApiDependencies = {}) {
  const api = new Hono<ApiEnvironment>();

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
  api.use(
    "/api/v1/private/*",
    createPrivateAuthMiddleware(dependencies.authProvider),
  );
  api.route(
    "/api/v1/private/overview",
    createPrivateOverviewRoutes(dependencies.privateOverview),
  );

  return api;
}

export const app = createApiApp();
export type ApiApp = typeof app;
