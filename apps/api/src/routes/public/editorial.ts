import type { PublicEditorialDocument } from "@semogtw/contracts";
import { Hono } from "hono";
import type { ApiEnvironment } from "../../middleware/request-context";

export type PublicEditorialKind = PublicEditorialDocument["kind"];
export type PublicEditorialSummary = Pick<
  PublicEditorialDocument,
  "kind" | "slug" | "title" | "excerpt" | "tags" | "updatedAt"
>;

export type PublicEditorialResolution = {
  document: PublicEditorialDocument | null;
  redirectSlug: string | null;
};

export interface PublicEditorialQueries {
  listSummaries(input: {
    kind: PublicEditorialKind;
    limit: number;
  }): Promise<readonly PublicEditorialSummary[]>;
  resolveBySlug(
    slug: string,
    kind: PublicEditorialKind,
  ): Promise<PublicEditorialResolution>;
}

const emptyQueries: PublicEditorialQueries = {
  listSummaries: async () => [],
  resolveBySlug: async () => ({ document: null, redirectSlug: null }),
};

const kinds = new Set<PublicEditorialKind>([
  "project",
  "note",
  "experiment",
  "page",
]);

function readKind(value: string): PublicEditorialKind | null {
  return kinds.has(value as PublicEditorialKind)
    ? (value as PublicEditorialKind)
    : null;
}

function readLimit(value: string | undefined): number | null {
  if (value === undefined) return 50;
  if (!/^\d{1,4}$/u.test(value)) return null;
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1) return null;
  return Math.min(parsed, 100);
}

function notFound(context: Parameters<Parameters<Hono<ApiEnvironment>["get"]>[1]>[0]) {
  context.header("cache-control", "no-store");
  return context.json(
    {
      ok: false,
      error: {
        code: "NOT_FOUND",
        message: "Publicação não encontrada.",
      },
    },
    404,
  );
}

export function createPublicEditorialRoutes(
  queries: PublicEditorialQueries = emptyQueries,
) {
  return new Hono<ApiEnvironment>({ strict: false })
    .get("/:kind", async (context) => {
      const kind = readKind(context.req.param("kind"));
      if (kind === null) return notFound(context);

      const limit = readLimit(context.req.query("limit"));
      if (limit === null) {
        context.header("cache-control", "no-store");
        return context.json(
          {
            ok: false,
            error: {
              code: "INVALID_QUERY",
              message: "Parâmetro de paginação inválido.",
            },
          },
          400,
        );
      }

      const data = await queries.listSummaries({ kind, limit });
      context.header("cache-control", "public, max-age=60, stale-while-revalidate=300");
      return context.json({ ok: true, data });
    })
    .get("/:kind/:slug", async (context) => {
      const kind = readKind(context.req.param("kind"));
      if (kind === null) return notFound(context);

      const resolution = await queries.resolveBySlug(
        context.req.param("slug"),
        kind,
      );
      if (resolution.document !== null) {
        context.header("cache-control", "public, max-age=60, stale-while-revalidate=300");
        return context.json({ ok: true, data: resolution.document });
      }
      if (resolution.redirectSlug !== null) {
        context.header("cache-control", "public, max-age=300");
        return context.redirect(
          `/api/v1/public/editorial/${kind}/${encodeURIComponent(resolution.redirectSlug)}`,
          308,
        );
      }
      return notFound(context);
    });
}
