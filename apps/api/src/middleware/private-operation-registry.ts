import type { MiddlewareHandler } from "hono";
import { privateStateWriteCapabilities } from "../private-capability-registry";
import type { ApiEnvironment } from "./request-context";

const privateMutationByPath = new Map(
  privateStateWriteCapabilities.map((capability) => [capability.path, capability]),
);

function normalizePath(path: string): string {
  if (path.length > 1 && path.endsWith("/")) return path.slice(0, -1);
  return path;
}

/**
 * Makes the capability registry a fail-closed mutation allowlist.
 *
 * Authentication/origin/CSRF middleware runs before this guard. A newly added
 * private POST therefore cannot silently become a write surface without also
 * declaring its canonical operation in the machine-readable capability
 * registry.
 */
export const requireRegisteredPrivateMutation: MiddlewareHandler<ApiEnvironment> =
  async (context, next) => {
    if (context.req.method !== "POST") {
      await next();
      return;
    }

    const path = normalizePath(context.req.path);
    const capability = privateMutationByPath.get(
      path as `/api/v1/private/${string}`,
    );
    if (capability === undefined) {
      context.header("cache-control", "no-store, private");
      return context.json(
        {
          ok: false,
          error: {
            code: "PRIVATE_MUTATION_NOT_REGISTERED",
            message: "Esta operação privada não está registrada neste runtime.",
            correlationId: context.get("correlationId"),
          },
        },
        503,
      );
    }

    context.header("x-semogtw-operation", capability.name);
    await next();
  };
