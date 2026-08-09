import { Hono } from "hono";
import type { ApiEnvironment } from "../middleware/request-context";

export interface ApiReadinessProbe {
  check(): boolean | Promise<boolean>;
}

const unavailableProbe: ApiReadinessProbe = {
  check: () => false,
};

/**
 * Public readiness endpoint for load balancers and deployment smoke tests.
 *
 * The route deliberately exposes only a binary ready/not-ready result. Storage
 * errors, missing secrets and other internal causes stay out of the response;
 * operators can correlate failures through the sanitized correlation id.
 */
export function createReadinessRoutes(
  probe: ApiReadinessProbe = unavailableProbe,
) {
  return new Hono<ApiEnvironment>({ strict: false }).get("/", async (context) => {
    context.header("cache-control", "no-store");

    let ready = false;
    try {
      ready = await probe.check();
    } catch {
      ready = false;
    }

    if (!ready) {
      context.header("retry-after", "5");
      return context.json(
        {
          ok: false,
          error: {
            code: "SERVICE_NOT_READY",
            message: "Serviço indisponível para tráfego.",
            correlationId: context.get("correlationId"),
          },
        },
        503,
      );
    }

    return context.json({
      ok: true,
      service: "semogtw-api",
      status: "ready",
    });
  });
}
