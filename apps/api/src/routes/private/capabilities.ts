import { Hono } from "hono";
import type { ApiEnvironment } from "../../middleware/request-context";
import type { PrivateRuntimeCapabilities } from "../../private-capabilities";

export interface PrivateCapabilityQueries {
  getCapabilities(): Promise<PrivateRuntimeCapabilities> | PrivateRuntimeCapabilities;
}

export function createPrivateCapabilityRoutes(
  queries?: PrivateCapabilityQueries,
) {
  return new Hono<ApiEnvironment>({ strict: false }).get("/", async (context) => {
    context.header("cache-control", "no-store, private");

    if (queries === undefined) {
      return context.json(
        {
          ok: false,
          error: {
            code: "CAPABILITIES_UNAVAILABLE",
            message: "Não foi possível identificar as capacidades deste runtime.",
            correlationId: context.get("correlationId"),
          },
        },
        503,
      );
    }

    try {
      return context.json({
        ok: true,
        data: await queries.getCapabilities(),
      });
    } catch {
      return context.json(
        {
          ok: false,
          error: {
            code: "CAPABILITIES_UNAVAILABLE",
            message: "Não foi possível identificar as capacidades deste runtime.",
            correlationId: context.get("correlationId"),
          },
        },
        503,
      );
    }
  });
}
