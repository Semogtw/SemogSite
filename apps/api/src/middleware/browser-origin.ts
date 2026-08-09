import { createMiddleware } from "hono/factory";
import type { ApiEnvironment } from "./request-context";

const safeMethods = new Set(["GET", "HEAD", "OPTIONS"]);

function sameOrigin(requestUrl: string, originHeader: string): boolean {
  try {
    return new URL(requestUrl).origin === new URL(originHeader).origin;
  } catch {
    return false;
  }
}

/**
 * Defense in depth for browser-originated state changes.
 *
 * Non-browser clients may omit Origin and continue to rely on endpoint auth and
 * CSRF controls. When a browser sends Origin, unsafe methods must be same-origin
 * with the URL that reached the application. This avoids hard-coding preview or
 * custom domains while rejecting ordinary cross-site form/fetch attempts.
 */
export const requireSameBrowserOrigin = createMiddleware<ApiEnvironment>(
  async (context, next) => {
    if (safeMethods.has(context.req.method)) {
      await next();
      return;
    }

    const origin = context.req.header("origin")?.trim();
    if (origin === undefined || origin.length === 0) {
      await next();
      return;
    }

    if (!sameOrigin(context.req.url, origin)) {
      context.header("cache-control", "no-store, private");
      return context.json(
        {
          ok: false,
          error: {
            code: "ORIGIN_INVALID",
            message: "Origem da solicitação não permitida.",
            correlationId: context.get("correlationId"),
          },
        },
        403,
      );
    }

    await next();
  },
);
