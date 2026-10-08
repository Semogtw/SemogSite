import type { AuthProvider } from "@semogtw/auth";
import { Hono } from "hono";
import { createPrivateAuthMiddleware } from "./middleware/auth";
import { requireSameBrowserOrigin } from "./middleware/browser-origin";
import { createPrivateCsrfMiddleware } from "./middleware/csrf";
import { sanitizedErrorHandler, sanitizedNotFoundHandler } from "./middleware/error-handler";
import { requireRegisteredPrivateMutation } from "./middleware/private-operation-registry";
import { createRequestObserverMiddleware, type ApiRequestObserver } from "./middleware/request-observer";
import { requestContext, type ApiEnvironment } from "./middleware/request-context";
import { securityHeaders } from "./middleware/security-headers";
import { createAuthSessionRoutes, type ApiAuthDependencies } from "./routes/auth/session";
import { createPrivateAuditRoutes, type PrivateAuditQueries } from "./routes/private/audit";
import { createPrivateEditorialRedirectRoutes, type PrivateEditorialRedirectCommands } from "./routes/private/editorial-redirects";
import { createPublicProjectRoutes, type PublicProjectQueries } from "./routes/public/projects";
import { createReadinessRoutes, type ApiReadinessProbe } from "./routes/readiness";

export type ApiDependencies = {
  auth?: ApiAuthDependencies;
  authProvider?: AuthProvider;
  requestObserver?: ApiRequestObserver;
  readiness?: ApiReadinessProbe;
  publicProjects?: PublicProjectQueries;
  privateAudit?: PrivateAuditQueries;
  privateEditorialRedirects?: PrivateEditorialRedirectCommands;
};

/**
 * SemogSite API: public published content and a deliberately small owner-only
 * administration boundary. Legacy project/agent orchestration APIs are not
 * mounted, even when historical tables and packages exist.
 */
export function createApiApp(dependencies: ApiDependencies = {}) {
  const api = new Hono<ApiEnvironment>({ strict: false });
  api.use("*", requestContext);
  api.use("*", createRequestObserverMiddleware(dependencies.requestObserver));
  api.use("*", securityHeaders);
  api.onError(sanitizedErrorHandler);
  api.notFound(sanitizedNotFoundHandler);

  api.get("/health", (context) => {
    context.header("cache-control", "no-store");
    return context.json({ ok: true, service: "semogtw-api" });
  });
  api.route("/ready", createReadinessRoutes(dependencies.readiness));
  api.route("/api/v1/public/projects", createPublicProjectRoutes(dependencies.publicProjects));

  api.use("/api/v1/auth/*", requireSameBrowserOrigin);
  api.route("/api/v1/auth", createAuthSessionRoutes(dependencies.auth));

  // Preserve this order: origin -> owner session -> CSRF -> mutation allowlist.
  api.use("/api/v1/private/*", requireSameBrowserOrigin);
  api.use(
    "/api/v1/private/*",
    createPrivateAuthMiddleware(dependencies.auth?.provider ?? dependencies.authProvider),
  );
  api.use(
    "/api/v1/private/*",
    createPrivateCsrfMiddleware(dependencies.auth?.sessionSecret),
  );
  api.use("/api/v1/private/*", requireRegisteredPrivateMutation);

  api.route("/api/v1/private/audit", createPrivateAuditRoutes(dependencies.privateAudit));
  api.route(
    "/api/v1/private/editorial-redirects",
    createPrivateEditorialRedirectRoutes(dependencies.privateEditorialRedirects),
  );
  return api;
}

export const app = createApiApp();
export type ApiApp = typeof app;
