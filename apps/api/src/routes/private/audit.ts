import type { AuditListInput, AuditPage } from "@semogtw/database";
import { Hono } from "hono";
import { z } from "zod";
import type { ApiEnvironment } from "../../middleware/request-context";

const AuditQuerySchema = z.object({
  page: z.coerce.number().int().min(1).max(100_000).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
  action: z.string().trim().max(200).optional(),
  entityType: z.string().trim().max(200).optional(),
});

export interface PrivateAuditQueries {
  list(input: AuditListInput): Promise<AuditPage>;
}

const emptyAudit: PrivateAuditQueries = {
  list: async (input) => ({
    items: [],
    page: input.page,
    pageSize: input.pageSize,
    total: 0,
    totalPages: 0,
  }),
};

export function createPrivateAuditRoutes(
  queries: PrivateAuditQueries = emptyAudit,
) {
  return new Hono<ApiEnvironment>({ strict: false }).get("/", async (context) => {
    const parsed = AuditQuerySchema.safeParse(context.req.query());
    if (!parsed.success) {
      return context.json(
        {
          ok: false,
          error: {
            code: "INVALID_REQUEST",
            message: "Filtros de auditoria inválidos.",
          },
        },
        400,
      );
    }

    const action = parsed.data.action?.trim();
    const entityType = parsed.data.entityType?.trim();
    return context.json({
      ok: true,
      data: await queries.list({
        page: parsed.data.page,
        pageSize: parsed.data.pageSize,
        ...(action ? { action } : {}),
        ...(entityType ? { entityType } : {}),
      }),
    });
  });
}
