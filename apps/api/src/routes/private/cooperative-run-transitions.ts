import type { CooperativeRunTransitionService } from "@semogtw/domain";
import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { z } from "zod";
import type { ApiEnvironment } from "../../middleware/request-context";

const MAX_RUN_TRANSITION_BODY_BYTES = 16 * 1024;
const retryKey = z.string().uuid();
const nullableText = (max: number) => z.string().max(max).nullable().optional();
const CommonTransitionSchema = z.object({
  idempotencyKey: retryKey,
  runId: z.string().max(200),
  expectedUpdatedAt: z.string().max(100),
  summary: z.string().max(2_000),
  phase: nullableText(200),
  branch: nullableText(255),
  blocker: nullableText(2_000),
  nextAction: z.string().max(1_000).optional(),
  confirmed: z.literal(true),
});
const HeartbeatSchema = CommonTransitionSchema;
const ProgressSchema = CommonTransitionSchema.extend({
  progress: z.number().int().min(0).max(100),
});
const FinalizeSchema = CommonTransitionSchema.extend({
  status: z.enum(["completed", "failed", "cancelled"]),
});

export type PrivateCooperativeRunTransitionCommands = Pick<
  CooperativeRunTransitionService,
  "heartbeat" | "updateProgress" | "finalize"
>;

type TransitionMethod = keyof PrivateCooperativeRunTransitionCommands;
type TransitionInput<M extends TransitionMethod> = Parameters<
  PrivateCooperativeRunTransitionCommands[M]
>[0];
type TransitionContext<M extends TransitionMethod> = Parameters<
  PrivateCooperativeRunTransitionCommands[M]
>[1];

function isJsonRequest(contentType: string | undefined): boolean {
  if (contentType === undefined) return false;
  const mediaType = contentType.split(";", 1)[0]?.trim().toLowerCase();
  return mediaType === "application/json" || mediaType?.endsWith("+json") === true;
}

const limitBody = bodyLimit({
  maxSize: MAX_RUN_TRANSITION_BODY_BYTES,
  onError: (context) => {
    context.header("cache-control", "no-store, private");
    return context.json(
      {
        ok: false,
        error: {
          code: "PAYLOAD_TOO_LARGE",
          message: "Não foi possível atualizar esta execução.",
          correlationId: context.get("correlationId"),
        },
      },
      413,
    );
  },
});

function commandContext<M extends TransitionMethod>(
  method: M,
  stableKey: string,
  actorId: string,
): TransitionContext<M> {
  const kind =
    method === "heartbeat"
      ? "heartbeat"
      : method === "updateProgress"
        ? "progress"
        : "finalize";
  return {
    actorId,
    eventId: `run-event-${kind}-${stableKey}`,
    idempotencyKey: `run-${kind}-${stableKey}`,
    correlationId: `correlation-run-${kind}-${stableKey}`,
    now: new Date().toISOString(),
  } as TransitionContext<M>;
}

function failureStatus(code: string): 400 | 404 | 409 {
  if (code === "VALIDATION_FAILED") return 400;
  if (code === "RUN_NOT_FOUND" || code === "NOT_FOUND") return 404;
  return 409;
}

function failureMessage(code: string): string {
  if (code === "VALIDATION_FAILED") return "Revise os campos da atualização.";
  if (code === "RUN_NOT_FOUND" || code === "NOT_FOUND") {
    return "Esta execução não existe mais.";
  }
  if (code === "DUPLICATE") return "Esta atualização já foi registrada.";
  if (code === "STALE_STATE" || code === "STALE") {
    return "A execução mudou desde a última leitura.";
  }
  if (code === "INVALID_TRANSITION") return "Esta transição não é permitida.";
  return "O estado mudou durante a atualização.";
}

export function createPrivateCooperativeRunTransitionRoutes(
  commands?: PrivateCooperativeRunTransitionCommands,
) {
  const routes = new Hono<ApiEnvironment>({ strict: false });

  async function execute<M extends TransitionMethod>(
    context: Parameters<Parameters<typeof routes.post>[1]>[0],
    method: M,
    schema: typeof HeartbeatSchema | typeof ProgressSchema | typeof FinalizeSchema,
  ) {
    context.header("cache-control", "no-store, private");
    if (!isJsonRequest(context.req.header("content-type"))) {
      return context.json(
        {
          ok: false,
          error: {
            code: "INVALID_REQUEST",
            message: "Não foi possível atualizar esta execução.",
            correlationId: context.get("correlationId"),
          },
        },
        400,
      );
    }

    const parsed = schema.safeParse(await context.req.json().catch(() => null));
    if (!parsed.success) {
      return context.json(
        {
          ok: false,
          error: {
            code: "INVALID_REQUEST",
            message: "Não foi possível atualizar esta execução.",
            correlationId: context.get("correlationId"),
          },
        },
        400,
      );
    }

    const owner = context.get("owner");
    if (owner === null) {
      return context.json(
        {
          ok: false,
          error: {
            code: "UNAUTHORIZED",
            message: "Acesso não autorizado.",
            correlationId: context.get("correlationId"),
          },
        },
        401,
      );
    }
    if (commands === undefined) {
      return context.json(
        {
          ok: false,
          error: {
            code: "MUTATION_UNAVAILABLE",
            message: "Não foi possível salvar esta atualização.",
            correlationId: context.get("correlationId"),
          },
        },
        503,
      );
    }

    const stableKey = parsed.data.idempotencyKey;
    const { confirmed: _confirmed, idempotencyKey: _retryKey, ...clientInput } =
      parsed.data;
    const finalizeStatus = "status" in clientInput ? clientInput.status : undefined;
    const domainInput = {
      ...clientInput,
      ...(finalizeStatus === undefined
        ? {}
        : {
            status: finalizeStatus,
            finalStatus: finalizeStatus,
            targetStatus: finalizeStatus,
          }),
    } as TransitionInput<M>;

    let result: Awaited<ReturnType<PrivateCooperativeRunTransitionCommands[M]>>;
    try {
      const command = commands[method] as (
        input: TransitionInput<M>,
        commandContext: TransitionContext<M>,
      ) => Promise<Awaited<ReturnType<PrivateCooperativeRunTransitionCommands[M]>>>;
      result = await command(
        domainInput,
        commandContext(method, stableKey, owner.id),
      );
    } catch {
      return context.json(
        {
          ok: false,
          error: {
            code: "STORAGE_UNAVAILABLE",
            message: "Não foi possível salvar esta atualização.",
            correlationId: context.get("correlationId"),
          },
        },
        503,
      );
    }

    if (!result.ok) {
      const code = String(result.code);
      const details = "errors" in result ? result.errors : undefined;
      return context.json(
        {
          ok: false,
          error: {
            code,
            message: failureMessage(code),
            ...(details === undefined ? {} : { details }),
            correlationId: context.get("correlationId"),
          },
        },
        failureStatus(code),
      );
    }

    const successful = result as typeof result & {
      run: {
        id: string;
        status: string;
        progress: number;
        updatedAt: string;
        finishedAt: string | null;
      };
    };
    return context.json({
      ok: true,
      data: {
        runId: successful.run.id,
        status: successful.run.status,
        progress: successful.run.progress,
        updatedAt: successful.run.updatedAt,
        finishedAt: successful.run.finishedAt,
        processStarted: false,
      },
    });
  }

  routes.post("/heartbeat", limitBody, (context) =>
    execute(context, "heartbeat", HeartbeatSchema),
  );
  routes.post("/progress", limitBody, (context) =>
    execute(context, "updateProgress", ProgressSchema),
  );
  routes.post("/finalize", limitBody, (context) =>
    execute(context, "finalize", FinalizeSchema),
  );

  return routes;
}
