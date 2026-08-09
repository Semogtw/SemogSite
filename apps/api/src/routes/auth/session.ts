import {
  CSRF_COOKIE_NAME,
  csrfCookieOptions,
  decideLogout,
  issueCsrfToken,
  SESSION_COOKIE_NAME,
  sessionCookieOptions,
  SlidingWindowRateLimiter,
  verifyCsrfToken,
  type AuthProvider,
  type RuntimeNodeEnv,
} from "@semogtw/auth";
import { Hono } from "hono";
import { getCookie, setCookie } from "hono/cookie";
import { z } from "zod";
import type { ApiEnvironment } from "../../middleware/request-context";

const LoginInput = z.object({
  password: z.string().min(1).max(1024),
});

type LoginRateLimitDecision = {
  readonly allowed: boolean;
  readonly retryAfterMs: number;
};

type LoginRateLimiter = {
  consume(
    key: string,
    now?: Date,
  ): LoginRateLimitDecision | Promise<LoginRateLimitDecision>;
  reset(key: string): void | Promise<void>;
};

export type ApiAuthDependencies = {
  readonly provider: AuthProvider;
  readonly sessionSecret: string;
  readonly nodeEnv: RuntimeNodeEnv;
  readonly loginLimiter?: LoginRateLimiter;
};

function disableCaching(context: {
  header(name: string, value: string): void;
}): void {
  context.header("cache-control", "no-store, private");
  context.header("pragma", "no-cache");
}

function clientRateKey(request: {
  header(name: string): string | undefined;
}): string {
  const cloudflare = request.header("cf-connecting-ip")?.trim();
  if (cloudflare) return `cf:${cloudflare}`;

  const forwarded = request.header("x-forwarded-for")
    ?.split(",", 1)[0]
    ?.trim();
  return forwarded ? `xff:${forwarded}` : "unknown-client";
}

function clearAuthCookies(
  context: Parameters<typeof setCookie>[0],
  nodeEnv: RuntimeNodeEnv,
): void {
  setCookie(context, SESSION_COOKIE_NAME, "", {
    ...sessionCookieOptions(nodeEnv),
    maxAge: 0,
  });
  setCookie(context, CSRF_COOKIE_NAME, "", {
    ...csrfCookieOptions(nodeEnv),
    maxAge: 0,
  });
}

export function createAuthSessionRoutes(
  dependencies?: ApiAuthDependencies,
) {
  const loginLimiter =
    dependencies?.loginLimiter ??
    new SlidingWindowRateLimiter({
      maxAttempts: 5,
      windowMs: 15 * 60 * 1000,
    });

  return new Hono<ApiEnvironment>({ strict: false })
    .get("/session", async (context) => {
      disableCaching(context);
      const rawToken = getCookie(context, SESSION_COOKIE_NAME);
      const owner =
        dependencies === undefined || rawToken === undefined
          ? null
          : await dependencies.provider.resolveSession(rawToken);

      return context.json({
        ok: true,
        data:
          owner === null
            ? { authenticated: false as const }
            : {
                authenticated: true as const,
                owner: {
                  id: owner.id,
                  expiresAt: owner.expiresAt,
                },
              },
      });
    })
    .post("/login", async (context) => {
      disableCaching(context);
      if (dependencies === undefined) {
        return context.json(
          {
            ok: false,
            error: {
              code: "UNAUTHORIZED",
              message: "Não foi possível autenticar.",
            },
          },
          401,
        );
      }

      const input = LoginInput.safeParse(
        await context.req.json().catch(() => null),
      );
      if (!input.success) {
        return context.json(
          {
            ok: false,
            error: {
              code: "INVALID_REQUEST",
              message: "Não foi possível autenticar.",
            },
          },
          400,
        );
      }

      const rateKey = clientRateKey(context.req);
      let rateLimit: LoginRateLimitDecision;
      try {
        rateLimit = await loginLimiter.consume(rateKey);
      } catch {
        return context.json(
          {
            ok: false,
            error: {
              code: "AUTH_UNAVAILABLE",
              message: "Não foi possível autenticar.",
            },
          },
          503,
        );
      }
      if (!rateLimit.allowed) {
        context.header(
          "retry-after",
          String(Math.max(1, Math.ceil(rateLimit.retryAfterMs / 1000))),
        );
        return context.json(
          {
            ok: false,
            error: {
              code: "RATE_LIMITED",
              message: "Não foi possível autenticar.",
            },
          },
          429,
        );
      }

      const result = await dependencies.provider.authenticate({
        password: input.data.password,
      });
      if (!result.ok) {
        return context.json(
          {
            ok: false,
            error: {
              code: "UNAUTHORIZED",
              message: "Não foi possível autenticar.",
            },
          },
          401,
        );
      }

      try {
        await loginLimiter.reset(rateKey);
      } catch {
        await dependencies.provider
          .revokeSession(result.session.id)
          .catch(() => undefined);
        return context.json(
          {
            ok: false,
            error: {
              code: "AUTH_UNAVAILABLE",
              message: "Não foi possível autenticar.",
            },
          },
          503,
        );
      }
      const csrfToken = await issueCsrfToken(
        dependencies.sessionSecret,
        result.session.id,
      );
      setCookie(
        context,
        SESSION_COOKIE_NAME,
        result.rawToken,
        sessionCookieOptions(dependencies.nodeEnv),
      );
      setCookie(
        context,
        CSRF_COOKIE_NAME,
        csrfToken,
        csrfCookieOptions(dependencies.nodeEnv),
      );

      return context.json({
        ok: true,
        data: {
          expiresAt: result.session.expiresAt,
        },
      });
    })
    .post("/logout", async (context) => {
      disableCaching(context);
      const rawToken = getCookie(context, SESSION_COOKIE_NAME);
      const csrfCookie = getCookie(context, CSRF_COOKIE_NAME);
      const owner =
        dependencies !== undefined && rawToken !== undefined
          ? await dependencies.provider.resolveSession(rawToken)
          : null;
      const csrfValid =
        owner !== null && dependencies !== undefined
          ? await verifyCsrfToken(
              dependencies.sessionSecret,
              owner.sessionId,
              csrfCookie ?? null,
              context.req.header("x-csrf-token") ?? null,
            )
          : false;
      const decision = decideLogout({
        hasRawToken: rawToken !== undefined,
        hasCsrfCookie: csrfCookie !== undefined,
        ownerResolved: owner !== null,
        csrfValid,
      });

      if (!decision.allowed) {
        return context.json(
          {
            ok: false,
            error: {
              code: "CSRF_INVALID",
              message: "Não foi possível validar esta sessão.",
            },
          },
          403,
        );
      }

      if (decision.revoke && dependencies !== undefined && owner !== null) {
        await dependencies.provider.revokeSession(owner.sessionId);
      }
      if (decision.clearCookies) {
        clearAuthCookies(
          context,
          dependencies?.nodeEnv ?? "production",
        );
      }

      return context.json({
        ok: true,
        data: { revoked: decision.revoke },
      });
    });
}
