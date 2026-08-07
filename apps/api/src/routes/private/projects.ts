import type { OperationalPortfolio, ProjectHub } from "@semogtw/domain";
import { Hono } from "hono";
import type { ApiEnvironment } from "../../middleware/request-context";

export interface PrivateProjectQueries {
  listPortfolio(): Promise<OperationalPortfolio>;
  getProjectHub(slug: string): Promise<ProjectHub | null>;
}

const emptyProjects: PrivateProjectQueries = {
  listPortfolio: async () => ({
    activeProjects: [],
    activeRepositories: [],
    repositoryCatalog: [],
  }),
  getProjectHub: async () => null,
};

export function createPrivateProjectRoutes(
  queries: PrivateProjectQueries = emptyProjects,
) {
  return new Hono<ApiEnvironment>({ strict: false })
    .get("/", async (context) =>
      context.json({ ok: true, data: await queries.listPortfolio() }),
    )
    .get("/:slug", async (context) => {
      const hub = await queries.getProjectHub(context.req.param("slug"));
      if (hub === null) {
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
      return context.json({ ok: true, data: hub });
    });
}
