import type { MiddlewareHandler } from "hono";
import { privateStateWriteCapabilities } from "../private-capability-registry";
import type { ApiEnvironment } from "./request-context";

type PrivateStateWriteCapability = (typeof privateStateWriteCapabilities)[number];

const safeMethods = new Set(["GET", "HEAD", "OPTIONS"]);
const privateMutationByMethodAndPath = new Map<string, PrivateStateWriteCapability>(
  privateStateWriteCapabilities.map((capability) => [
    `${capability.method} ${capability.path}`,
    capability,
  ]),
);

function normalizePath(path: string): string {
  if (path.length > 1 && path.endsWith("/")) return path.slice(0, -1);
  return path;
}

/**
 * Makes the capability registry a fail-closed mutation allowlist.
 *
 * Authentication/origin/CSRF middleware runs before this guard. A newly added
 * unsafe private method therefore cannot silently become a write surface
 * without declaring its exact method/path pair in the capability registry.
 */
export const requireRegisteredPrivateMutation: MiddlewareHandler<ApiEnvironment> =
  async (context, next) => {
    if (safeMethods.has(context.req.method)) {
      await next();
      return;
    }

    const path = normalizePath(context.req.path);
    const capability = privateMutationByMethodAndPath.get(
      `${context.req.method} ${path}`,
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
    context.header("x-semogtw-retry-semantics", capability.retrySemantics);
    await next();
  };
