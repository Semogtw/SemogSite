import {
  SESSION_COOKIE_NAME,
  type AuthProvider,
} from "@semogtw/auth";
import { getCookie } from "hono/cookie";
import { createMiddleware } from "hono/factory";
import type { ApiEnvironment } from "./request-context";

export function createPrivateAuthMiddleware(authProvider?: AuthProvider) {
  return createMiddleware<ApiEnvironment>(async (context, next) => {
    context.header("cache-control", "no-store, private");
    context.header("pragma", "no-cache");

    if (authProvider === undefined) {
      return context.json(
        {
          ok: false,
          error: {
            code: "UNAUTHORIZED",
            message: "Acesso não autorizado.",
          },
        },
        401,
      );
    }

    const rawToken = getCookie(context, SESSION_COOKIE_NAME);
    const owner =
      rawToken === undefined
        ? null
        : await authProvider.resolveSession(rawToken);
    if (owner === null) {
      return context.json(
        {
          ok: false,
          error: {
            code: "UNAUTHORIZED",
            message: "Acesso não autorizado.",
          },
        },
        401,
      );
    }

    context.set("owner", owner);
    await next();
  });
}
