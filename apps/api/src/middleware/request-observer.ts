import { createMiddleware } from "hono/factory";
import type { ApiEnvironment } from "./request-context";

export type ApiRequestScope =
  | "health"
  | "ready"
  | "public"
  | "auth"
  | "private"
  | "unknown";

export type ApiRequestObservation = {
  readonly correlationId: string;
  readonly method: string;
  readonly scope: ApiRequestScope;
  readonly status: number;
  readonly durationMs: number;
};

export interface ApiRequestObserver {
  record(observation: ApiRequestObservation): void;
}

export function isRequestLoggingEnabled(value: string | undefined): boolean {
  const normalized = value?.trim().toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "enabled";
}

function scopeFor(pathname: string): ApiRequestScope {
  if (pathname === "/health") return "health";
  if (pathname === "/ready" || pathname.startsWith("/ready/")) return "ready";
  if (
    pathname === "/api/v1/public" ||
    pathname.startsWith("/api/v1/public/")
  ) {
    return "public";
  }
  if (pathname === "/api/v1/auth" || pathname.startsWith("/api/v1/auth/")) {
    return "auth";
  }
  if (
    pathname === "/api/v1/private" ||
    pathname.startsWith("/api/v1/private/")
  ) {
    return "private";
  }
  return "unknown";
}

/**
 * Records only deliberately coarse request metadata.
 *
 * Raw URLs, query strings, route parameters, headers, cookies, IP addresses,
 * request/response bodies and private DTOs are intentionally absent from the
 * observation type, which keeps the default operational signal allowlisted.
 */
export function createRequestObserverMiddleware(observer?: ApiRequestObserver) {
  return createMiddleware<ApiEnvironment>(async (context, next) => {
    if (observer === undefined) {
      await next();
      return;
    }

    const startedAt = Date.now();
    let failed = false;
    try {
      await next();
    } catch (error) {
      failed = true;
      throw error;
    } finally {
      const observation: ApiRequestObservation = {
        correlationId: context.get("correlationId"),
        method: context.req.method.toUpperCase().slice(0, 16),
        scope: scopeFor(new URL(context.req.url).pathname),
        status: failed ? 500 : context.res.status,
        durationMs: Math.max(0, Date.now() - startedAt),
      };
      try {
        observer.record(observation);
      } catch {
        // Observability must never change the request outcome.
      }
    }
  });
}

export const consoleRequestObserver: ApiRequestObserver = {
  record(observation) {
    console.info(
      JSON.stringify({
        event: "semogtw.api.request",
        ...observation,
      }),
    );
  },
};
