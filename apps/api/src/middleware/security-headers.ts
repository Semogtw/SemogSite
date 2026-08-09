import { createMiddleware } from "hono/factory";
import type { ApiEnvironment } from "./request-context";

function isSensitiveApiPath(pathname: string): boolean {
  return (
    pathname === "/api/v1/auth" ||
    pathname.startsWith("/api/v1/auth/") ||
    pathname === "/api/v1/private" ||
    pathname.startsWith("/api/v1/private/")
  );
}

/**
 * Adds browser-facing response hardening without imposing a CORS policy on the
 * intentionally public API surface. Sensitive auth/private responses are
 * explicitly same-origin resources in addition to their route-level no-store
 * policies.
 */
export const securityHeaders = createMiddleware<ApiEnvironment>(
  async (context, next) => {
    await next();

    context.header("x-content-type-options", "nosniff");
    context.header("referrer-policy", "no-referrer");
    context.header("x-frame-options", "DENY");
    context.header("permissions-policy", "camera=(), microphone=(), geolocation=()");

    if (isSensitiveApiPath(new URL(context.req.url).pathname)) {
      context.header("cross-origin-resource-policy", "same-origin");
    }
  },
);
