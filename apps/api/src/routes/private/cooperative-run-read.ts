import type { CooperativeRunSnapshot } from "@semogtw/domain";
import { Hono } from "hono";
import { z } from "zod";
import type { ApiEnvironment } from "../../middleware/request-context";

export type PrivateCooperativeRunLedgerEvent = {
  id: string;
  sequence: number;
  kind: string;
  actor: string;
  source: string;
  summary: string;
  before: unknown;
  after: unknown;
  occurredAt: string;
  idempotencyKey: string;
  correlationId: string;
};

export interface PrivateCooperativeRunQueries {
  listRecent(input: {
    limit: number;
  }): Promise<readonly CooperativeRunSnapshot[]>;
  findRun(runId: string): Promise<CooperativeRunSnapshot | null>;
  listEvents(
    runId: string,
    limit: number,
  ): Promise<readonly PrivateCooperativeRunLedgerEvent[]>;
}

const ListQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(50),
});
const DetailQuerySchema = z.object({
  eventLimit: z.coerce.number().int().min(1).max(200).default(100),
});
const RunIdSchema = z.string().min(1).max(200);

function errorResponse(
  context: Parameters<Parameters<Hono<ApiEnvironment>["get"]>[1]>[0],
  code: string,
  message: string,
  status: 400 | 404 | 503,
) {
  context.header("cache-control", "no-store, private");
  return context.json(
    {
      ok: false,
      error: {
        code,
        message,
        correlationId: context.get("correlationId"),
      },
    },
    status,
  );
}

export function createPrivateCooperativeRunReadRoutes(
  queries?: PrivateCooperativeRunQueries,
) {
  const routes = new Hono<ApiEnvironment>({ strict: false });

  routes.get("/", async (context) => {
    context.header("cache-control", "no-store, private");
    const parsed = ListQuerySchema.safeParse(context.req.query());
    if (!parsed.success) {
      return errorResponse(
        context,
        "INVALID_REQUEST",
        "Não foi possível listar estas execuções.",
        400,
      );
    }
    if (queries === undefined) {
      return errorResponse(
        context,
        "QUERY_UNAVAILABLE",
        "Não foi possível consultar estas execuções.",
        503,
      );
    }

    try {
      const runs = await queries.listRecent({ limit: parsed.data.limit });
      return context.json({ ok: true, data: { runs } });
    } catch {
      return errorResponse(
        context,
        "STORAGE_UNAVAILABLE",
        "Não foi possível consultar estas execuções.",
        503,
      );
    }
  });

  routes.get("/:runId", async (context) => {
    context.header("cache-control", "no-store, private");
    const runId = RunIdSchema.safeParse(context.req.param("runId"));
    const parsed = DetailQuerySchema.safeParse(context.req.query());
    if (!runId.success || !parsed.success) {
      return errorResponse(
        context,
        "INVALID_REQUEST",
        "Não foi possível consultar esta execução.",
        400,
      );
    }
    if (queries === undefined) {
      return errorResponse(
        context,
        "QUERY_UNAVAILABLE",
        "Não foi possível consultar esta execução.",
        503,
      );
    }

    try {
      const run = await queries.findRun(runId.data);
      if (run === null) {
        return errorResponse(
          context,
          "RUN_NOT_FOUND",
          "Esta execução não existe mais.",
          404,
        );
      }
      const events = await queries.listEvents(runId.data, parsed.data.eventLimit);
      return context.json({ ok: true, data: { run, events } });
    } catch {
      return errorResponse(
        context,
        "STORAGE_UNAVAILABLE",
        "Não foi possível consultar esta execução.",
        503,
      );
    }
  });

  return routes;
}
