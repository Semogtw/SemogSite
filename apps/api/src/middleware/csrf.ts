import { CSRF_COOKIE_NAME, verifyCsrfToken } from "@semogtw/auth";
import { getCookie } from "hono/cookie";
import { createMiddleware } from "hono/factory";
import type { ApiEnvironment } from "./request-context";

const safeMethods = new Set(["GET", "HEAD", "OPTIONS"]);

/**
 * Shared CSRF gate for every unsafe method under the private API.
 *
 * Private authentication must run before this middleware so the session id is
 * available from context. A future private mutation inherits this protection
 * automatically when mounted below `/api/v1/private/*`.
 */
export function createPrivateCsrfMiddleware(sessionSecret?: string) {
  return createMiddleware<ApiEnvironment>(async (context, next) => {
    if (safeMethods.has(context.req.method)) {
      await next();
      return;
    }

    const owner = context.get("owner");
    const cookieToken = getCookie(context, CSRF_COOKIE_NAME) ?? null;
    const headerToken = context.req.header("x-csrf-token") ?? null;
    const valid =
      owner !== null && sessionSecret !== undefined
        ? await verifyCsrfToken(
            sessionSecret,
            owner.sessionId,
            cookieToken,
            headerToken,
          )
        : false;

    if (!valid) {
      context.header("cache-control", "no-store, private");
      return context.json(
        {
          ok: false,
          error: {
            code: "CSRF_INVALID",
            message: "Não foi possível validar esta sessão.",
            correlationId: context.get("correlationId"),
          },
        },
        403,
      );
    }

    await next();
  });
}
