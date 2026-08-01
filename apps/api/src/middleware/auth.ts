import type { AuthProvider } from "@semogtw/auth";
import { getCookie } from "hono/cookie";
import { createMiddleware } from "hono/factory";
import type { ApiEnvironment } from "./request-context";

const SESSION_COOKIE = "semogtw_session";

export function createPrivateAuthMiddleware(authProvider?: AuthProvider) {
  return createMiddleware<ApiEnvironment>(async (context, next) => {
    if (authProvider === undefined) {
      return context.json(
        { ok: false, error: { code: "UNAUTHORIZED", message: "Acesso não autorizado." } },
        401,
      );
    }

    const rawToken = getCookie(context, SESSION_COOKIE);
    const owner =
      rawToken === undefined ? null : await authProvider.resolveSession(rawToken);
    if (owner === null) {
      return context.json(
        { ok: false, error: { code: "UNAUTHORIZED", message: "Acesso não autorizado." } },
        401,
      );
    }

    context.set("owner", owner);
    await next();
  });
}
