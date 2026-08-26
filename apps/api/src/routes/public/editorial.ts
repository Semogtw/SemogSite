import type { PublicEditorialDocument } from "@semogtw/contracts";
import { Hono, type Context } from "hono";
import type { ApiEnvironment } from "../../middleware/request-context";

export type PublicEditorialKind = PublicEditorialDocument["kind"];
export type PublicEditorialProjection = Omit<PublicEditorialDocument, "tags"> & {
  readonly tags: readonly string[];
};
export type PublicEditorialSummary = Pick<
  PublicEditorialProjection,
  "kind" | "slug" | "title" | "excerpt" | "tags" | "updatedAt"
>;

export type PublicEditorialRedirect = {
  targetSlug: string;
};

export interface PublicEditorialQueries {
  listSummaries(input: {
    kind: PublicEditorialKind;
    limit: number;
  }): Promise<readonly PublicEditorialSummary[]>;
  findBySlug(slug: string): Promise<PublicEditorialProjection | null>;
  resolveRedirect(
    slug: string,
    kind: PublicEditorialKind,
  ): Promise<PublicEditorialRedirect | null>;
}

const emptyQueries: PublicEditorialQueries = {
  listSummaries: async () => [],
  findBySlug: async () => null,
  resolveRedirect: async () => null,
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

function notFound(context: Context<ApiEnvironment>) {
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

      const slug = context.req.param("slug");
      const document = await queries.findBySlug(slug);
      if (document !== null && document.kind === kind) {
        context.header("cache-control", "public, max-age=60, stale-while-revalidate=300");
        return context.json({ ok: true, data: document });
      }

      const redirect = await queries.resolveRedirect(slug, kind);
      if (redirect !== null) {
        context.header("cache-control", "public, max-age=300");
        return context.redirect(
          `/api/v1/public/editorial/${kind}/${encodeURIComponent(redirect.targetSlug)}`,
          308,
        );
      }
      return notFound(context);
    });
}
