import {
  issueCsrfToken,
  sessionCookieOptions,
  SlidingWindowRateLimiter,
  verifyCsrfToken,
} from "@semogtw/auth";
import { redirect } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import {
  deleteCookie,
  getCookie,
  getRequestHeader,
  setCookie,
} from "@tanstack/react-start/server";
import { z } from "zod";
import {
  getWebAuthProvider,
  getWebSessionSecret,
} from "./auth-runtime";

export const SESSION_COOKIE = "semogtw_session";
export const CSRF_COOKIE = "semogtw_csrf";

const loginLimiter = new SlidingWindowRateLimiter({
  maxAttempts: 5,
  windowMs: 15 * 60 * 1000,
});

const safeReturnTo = (value: string | undefined): string =>
  value?.startsWith("/devos") && !value.startsWith("//") ? value : "/devos";

export const getCurrentOwnerFn = createServerFn({ method: "GET" }).handler(
  async () => {
    const provider = getWebAuthProvider();
    const rawToken = getCookie(SESSION_COOKIE);
    if (provider === null || rawToken === undefined) return null;
    return provider.resolveSession(rawToken);
  },
);

export const loginOwnerFn = createServerFn({ method: "POST" })
  .validator(
    z.object({
      password: z.string().min(1),
      returnTo: z.string().optional(),
    }),
  )
  .handler(async ({ data }) => {
    const provider = getWebAuthProvider();
    const secret = getWebSessionSecret();
    const rateKey = getRequestHeader("x-forwarded-for") ?? "unknown-client";

    if (provider === null || secret === null || !loginLimiter.consume(rateKey)) {
      return { ok: false as const, message: "Não foi possível autenticar." };
    }

    const result = await provider.authenticate({ password: data.password });
    if (!result.ok) {
      return { ok: false as const, message: "Não foi possível autenticar." };
    }

    loginLimiter.reset(rateKey);
    const csrf = await issueCsrfToken(secret, result.session.id);
    const production = process.env.NODE_ENV === "production";
    setCookie(SESSION_COOKIE, result.rawToken, sessionCookieOptions(production));
    setCookie(CSRF_COOKIE, csrf, {
      httpOnly: false,
      sameSite: "lax",
      secure: production,
      path: "/devos",
      maxAge: 60 * 60 * 24 * 14,
    });

    throw redirect({ to: safeReturnTo(data.returnTo) });
  });

export const logoutOwnerFn = createServerFn({ method: "POST" })
  .validator(z.object({ csrfToken: z.string().min(1) }))
  .handler(async ({ data }) => {
    const provider = getWebAuthProvider();
    const secret = getWebSessionSecret();
    const rawToken = getCookie(SESSION_COOKIE);
    const csrfCookie = getCookie(CSRF_COOKIE);

    if (provider !== null && secret !== null && rawToken && csrfCookie) {
      const owner = await provider.resolveSession(rawToken);
      if (
        owner !== null &&
        (await verifyCsrfToken(
          secret,
          owner.sessionId,
          csrfCookie,
          data.csrfToken,
        ))
      ) {
        await provider.revokeSession(owner.sessionId);
      }
    }

    deleteCookie(SESSION_COOKIE, { path: "/" });
    deleteCookie(CSRF_COOKIE, { path: "/devos" });
    throw redirect({ to: "/devos/login" });
  });
