import {
  toPublicProjectDto,
  type PublishableProjectSource,
} from "@semogtw/contracts";
import { Hono } from "hono";
import type { ApiEnvironment } from "../../middleware/request-context";

export interface PublicProjectQueries {
  list(): Promise<readonly PublishableProjectSource[]>;
  findBySlug(slug: string): Promise<PublishableProjectSource | null>;
}

const emptyQueries: PublicProjectQueries = {
  list: async () => [],
  findBySlug: async () => null,
};

const canPublish = (source: PublishableProjectSource): boolean =>
  source.visibility !== "private" && source.publicSummary !== null;

export function createPublicProjectRoutes(
  queries: PublicProjectQueries = emptyQueries,
) {
  return new Hono<ApiEnvironment>({ strict: false })
    .get("/", async (context) => {
      const sources = await queries.list();
      const data = sources
        .filter(
          (source) => source.visibility === "public" && canPublish(source),
        )
        .map(toPublicProjectDto);
      return context.json({ ok: true, data });
    })
    .get("/:slug", async (context) => {
      const source = await queries.findBySlug(context.req.param("slug"));
      if (source === null || !canPublish(source)) {
        return context.json(
          {
            ok: false,
            error: {
              code: "NOT_FOUND",
              message: "Projeto não encontrado.",
            },
          },
          404,
        );
      }
      return context.json({ ok: true, data: toPublicProjectDto(source) });
    });
}
