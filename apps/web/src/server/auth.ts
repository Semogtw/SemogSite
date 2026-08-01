import {
  CSRF_COOKIE_NAME,
  issueCsrfToken,
  sessionCookieOptions,
  SESSION_COOKIE_NAME,
  SlidingWindowRateLimiter,
  verifyCsrfToken,
} from "@semogtw/auth";
import { createServerFn } from "@tanstack/react-start";
import {
  deleteCookie,
  getCookie,
  getRequestHeader,
  setCookie,
} from "@tanstack/react-start/server";
import { z } from "zod";
import { safeReturnTo } from "./auth-navigation";
import {
  getWebAuthProvider,
  getWebSessionSecret,
} from "./auth-runtime";
import { resolveCurrentOwner } from "./current-owner.server";
import { decideLogout } from "./logout-policy";
import { ensureWebAuthConfigured } from "./node-auth-composition.server";

export const SESSION_COOKIE = SESSION_COOKIE_NAME;
export const CSRF_COOKIE = CSRF_COOKIE_NAME;

const loginLimiter = new SlidingWindowRateLimiter({
  maxAttempts: 5,
  windowMs: 15 * 60 * 1000,
});

export const getCurrentOwnerFn = createServerFn({ method: "GET" }).handler(
  resolveCurrentOwner,
);

export const loginOwnerFn = createServerFn({ method: "POST" })
  .validator(
    z.object({
      password: z.string().min(1),
      returnTo: z.string().optional(),
    }),
  )
  .handler(async ({ data }) => {
    const configured = await ensureWebAuthConfigured();
    const provider = getWebAuthProvider();
    const secret = getWebSessionSecret();

    if (!configured || provider === null || secret === null) {
      return { ok: false as const, message: "Não foi possível autenticar." };
    }

    const rateKey = getRequestHeader("x-forwarded-for") ?? "unknown-client";
    const rateLimit = loginLimiter.consume(rateKey);
    if (!rateLimit.allowed) {
      return { ok: false as const, message: "Não foi possível autenticar." };
    }

    const result = await provider.authenticate({ password: data.password });
    if (!result.ok) {
      return { ok: false as const, message: "Não foi possível autenticar." };
    }

    loginLimiter.reset(rateKey);
    const csrf = await issueCsrfToken(secret, result.session.id);
    const runtimeEnv = import.meta.env.PROD ? "production" : "development";
    setCookie(
      SESSION_COOKIE_NAME,
      result.rawToken,
      sessionCookieOptions(runtimeEnv),
    );
    setCookie(CSRF_COOKIE_NAME, csrf, {
      httpOnly: false,
      sameSite: "lax",
      secure: runtimeEnv === "production",
      path: "/",
      maxAge: 60 * 60 * 24 * 14,
    });

    return {
      ok: true as const,
      redirectTo: safeReturnTo(data.returnTo),
    };
  });

export const logoutOwnerFn = createServerFn({ method: "POST" })
  .validator(z.object({ csrfToken: z.string().min(1) }))
  .handler(async ({ data }) => {
    await ensureWebAuthConfigured();

    const provider = getWebAuthProvider();
    const secret = getWebSessionSecret();
    const rawToken = getCookie(SESSION_COOKIE_NAME);
    const csrfCookie = getCookie(CSRF_COOKIE_NAME);
    const owner =
      provider !== null && rawToken !== undefined
        ? await provider.resolveSession(rawToken)
        : null;
    const csrfValid =
      owner !== null && secret !== null && csrfCookie !== undefined
        ? await verifyCsrfToken(
            secret,
            owner.sessionId,
            csrfCookie,
            data.csrfToken,
          )
        : false;
    const decision = decideLogout({
      hasRawToken: rawToken !== undefined,
      hasCsrfCookie: csrfCookie !== undefined,
      ownerResolved: owner !== null,
      csrfValid,
    });

    if (!decision.allowed) {
      return {
        ok: false as const,
        message: "Não foi possível validar esta sessão.",
      };
    }

    if (decision.revoke && provider !== null && owner !== null) {
      await provider.revokeSession(owner.sessionId);
    }
    if (decision.clearCookies) {
      deleteCookie(SESSION_COOKIE_NAME, { path: "/" });
      deleteCookie(CSRF_COOKIE_NAME, { path: "/" });
    }

    return {
      ok: true as const,
      revoked: decision.revoke,
      redirectTo: "/devos/login" as const,
    };
  });
