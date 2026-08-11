import type { CooperativeRunSnapshot } from "@semogtw/domain";
import { Hono, type Context } from "hono";
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

export type PrivateCooperativeRunListInput = {
  limit: number;
  projectId?: string;
  status?: CooperativeRunSnapshot["status"];
  cursor?: {
    updatedAt: string;
    id: string;
  };
};

export type PrivateCooperativeRunEventListInput = {
  limit: number;
  beforeSequence?: number;
  includeSnapshots?: boolean;
};

export interface PrivateCooperativeRunQueries {
  listRecent(
    input: PrivateCooperativeRunListInput,
  ): Promise<readonly CooperativeRunSnapshot[]>;
  findRun(runId: string): Promise<CooperativeRunSnapshot | null>;
  listEvents(
    runId: string,
    input: number | PrivateCooperativeRunEventListInput,
  ): Promise<readonly PrivateCooperativeRunLedgerEvent[]>;
}

const ListQuerySchema = z
  .object({
    limit: z.coerce.number().int().min(1).max(100).default(50),
    projectId: z.string().trim().min(1).max(200).optional(),
    runningOnly: z.enum(["true", "false"]).optional(),
    beforeUpdatedAt: z.string().datetime({ offset: true }).optional(),
    beforeId: z.string().trim().min(1).max(200).optional(),
  })
  .superRefine((value, context) => {
    if ((value.beforeUpdatedAt === undefined) !== (value.beforeId === undefined)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Run pagination cursor requires updatedAt and id.",
      });
    }
  });
const DetailQuerySchema = z.object({
  eventLimit: z.coerce.number().int().min(1).max(200).default(100),
  beforeSequence: z.coerce.number().int().positive().optional(),
});
const RunIdSchema = z.string().min(1).max(200);

function errorResponse(
  context: Context<ApiEnvironment>,
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

function listInput(
  query: z.infer<typeof ListQuerySchema>,
): PrivateCooperativeRunListInput {
  return {
    limit: query.limit,
    ...(query.projectId === undefined ? {} : { projectId: query.projectId }),
    ...(query.runningOnly === "true" ? { status: "running" as const } : {}),
    ...(query.beforeUpdatedAt === undefined || query.beforeId === undefined
      ? {}
      : {
          cursor: {
            updatedAt: query.beforeUpdatedAt,
            id: query.beforeId,
          },
        }),
  };
}

function nextRunCursor(
  runs: readonly CooperativeRunSnapshot[],
  requestedLimit: number,
): { updatedAt: string; id: string } | null {
  if (runs.length !== requestedLimit) return null;
  const last = runs.at(-1);
  return last === undefined ? null : { updatedAt: last.updatedAt, id: last.id };
}

function nextEventCursor(
  events: readonly PrivateCooperativeRunLedgerEvent[],
  requestedLimit: number,
): number | null {
  if (events.length !== requestedLimit) return null;
  return events.at(-1)?.sequence ?? null;
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
      const runs = await queries.listRecent(listInput(parsed.data));
      return context.json({
        ok: true,
        data: {
          runs,
          nextCursor: nextRunCursor(runs, parsed.data.limit),
        },
      });
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
      const eventInput =
        parsed.data.beforeSequence === undefined
          ? parsed.data.eventLimit
          : {
              limit: parsed.data.eventLimit,
              beforeSequence: parsed.data.beforeSequence,
            };
      const events = await queries.listEvents(runId.data, eventInput);
      return context.json({
        ok: true,
        data: {
          run,
          events,
          nextEventCursor: nextEventCursor(events, parsed.data.eventLimit),
        },
      });
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
