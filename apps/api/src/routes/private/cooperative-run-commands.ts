import type {
  CooperativeRunCommandQueueContext,
  CooperativeRunCommandQueueResult,
  QueueCooperativeRunCommandInput,
} from "@semogtw/domain";
import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { z } from "zod";
import type { ApiEnvironment } from "../../middleware/request-context";

const MAX_RUN_COMMAND_BODY_BYTES = 24 * 1024;

const common = {
  idempotencyKey: z.string().uuid(),
  runId: z.string().trim().min(1).max(200),
  summary: z.string().trim().min(1).max(1_000),
  expiresAt: z.string().datetime({ offset: true }).nullable(),
  confirmed: z.literal(true),
} as const;

const QueueRunCommandSchema = z.discriminatedUnion("kind", [
  z.object({
    ...common,
    kind: z.literal("continue"),
    note: z.string().trim().min(1).max(1_000).nullable(),
  }),
  z.object({
    ...common,
    kind: z.literal("pause"),
    reason: z.string().trim().min(1).max(2_000),
  }),
  z.object({
    ...common,
    kind: z.literal("cancel"),
    reason: z.string().trim().min(1).max(2_000),
  }),
  z.object({
    ...common,
    kind: z.literal("reprioritize"),
    priority: z.enum(["low", "normal", "high"]),
    note: z.string().trim().min(1).max(1_000).nullable(),
  }),
  z.object({
    ...common,
    kind: z.literal("request_checkpoint"),
    include: z
      .array(z.enum(["commits", "tests", "blockers", "next_step"]))
      .max(4),
  }),
  z.object({
    ...common,
    kind: z.literal("provide_context"),
    context: z.string().trim().min(1).max(4_000),
  }),
]);

type QueueRunCommandRequest = z.infer<typeof QueueRunCommandSchema>;

export interface PrivateCooperativeRunCommandQueueCommands {
  queue(
    input: QueueCooperativeRunCommandInput,
    context: CooperativeRunCommandQueueContext,
  ): Promise<CooperativeRunCommandQueueResult>;
}

function isJsonRequest(contentType: string | undefined): boolean {
  if (contentType === undefined) return false;
  const mediaType = contentType.split(";", 1)[0]?.trim().toLowerCase();
  return mediaType === "application/json" || mediaType?.endsWith("+json") === true;
}

function commandPayload(data: QueueRunCommandRequest): unknown {
  if (data.kind === "continue") {
    return data.note === null ? {} : { note: data.note };
  }
  if (data.kind === "pause" || data.kind === "cancel") {
    return { reason: data.reason };
  }
  if (data.kind === "reprioritize") {
    return data.note === null
      ? { priority: data.priority }
      : { priority: data.priority, note: data.note };
  }
  if (data.kind === "request_checkpoint") {
    return { include: data.include };
  }
  return { context: data.context };
}

function failureStatus(code: string): 400 | 404 | 409 {
  if (code === "VALIDATION_FAILED") return 400;
  if (code === "RUN_NOT_FOUND") return 404;
  return 409;
}

function failureMessage(code: string): string {
  if (code === "VALIDATION_FAILED") {
    return "Revise o tipo, os detalhes e a expiração do comando.";
  }
  if (code === "RUN_NOT_FOUND") return "A execução não existe mais.";
  if (code === "TERMINAL_RUN") {
    return "Execuções finalizadas não recebem novos comandos.";
  }
  if (code === "DUPLICATE") return "Este comando já foi enfileirado.";
  return "O estado mudou durante a gravação. Nenhum comando parcial foi criado.";
}

const limitBody = bodyLimit({
  maxSize: MAX_RUN_COMMAND_BODY_BYTES,
  onError: (context) => {
    context.header("cache-control", "no-store, private");
    return context.json(
      {
        ok: false,
        error: {
          code: "PAYLOAD_TOO_LARGE",
          message: "Não foi possível enfileirar este comando.",
          correlationId: context.get("correlationId"),
        },
      },
      413,
    );
  },
});

export function createPrivateCooperativeRunCommandRoutes(
  commands?: PrivateCooperativeRunCommandQueueCommands,
) {
  return new Hono<ApiEnvironment>({ strict: false }).post(
    "/commands",
    limitBody,
    async (context) => {
      context.header("cache-control", "no-store, private");
      if (!isJsonRequest(context.req.header("content-type"))) {
        return context.json(
          {
            ok: false,
            error: {
              code: "INVALID_REQUEST",
              message: "Não foi possível enfileirar este comando.",
              correlationId: context.get("correlationId"),
            },
          },
          400,
        );
      }

      const parsed = QueueRunCommandSchema.safeParse(
        await context.req.json().catch(() => null),
      );
      if (!parsed.success) {
        return context.json(
          {
            ok: false,
            error: {
              code: "INVALID_REQUEST",
              message: "Não foi possível enfileirar este comando.",
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
              message: "Não foi possível enfileirar este comando.",
              correlationId: context.get("correlationId"),
            },
          },
          503,
        );
      }

      const stableKey = parsed.data.idempotencyKey;
      let result: CooperativeRunCommandQueueResult;
      try {
        result = await commands.queue(
          {
            runId: parsed.data.runId,
            kind: parsed.data.kind,
            summary: parsed.data.summary,
            payload: commandPayload(parsed.data),
            expiresAt: parsed.data.expiresAt,
          },
          {
            actorId: owner.id,
            commandId: `run-command-${stableKey}`,
            eventId: `run-event-owner-command-${stableKey}`,
            idempotencyKey: `owner-command-${stableKey}`,
            correlationId: `correlation-owner-command-${stableKey}`,
            source: "manual",
            now: new Date().toISOString(),
          },
        );
      } catch {
        return context.json(
          {
            ok: false,
            error: {
              code: "STORAGE_UNAVAILABLE",
              message: "Não foi possível enfileirar este comando.",
              correlationId: context.get("correlationId"),
            },
          },
          503,
        );
      }

      if (!result.ok) {
        return context.json(
          {
            ok: false,
            error: {
              code: result.code,
              message: failureMessage(result.code),
              ...(result.code === "VALIDATION_FAILED"
                ? { details: result.errors }
                : {}),
              correlationId: context.get("correlationId"),
            },
          },
          failureStatus(result.code),
        );
      }

      return context.json(
        {
          ok: true,
          data: {
            commandId: result.command.id,
            runId: result.command.runId,
            kind: result.command.kind,
            status: result.command.status,
            queuedAt: result.command.queuedAt,
            delivered: false,
            processControlTriggered: false,
          },
        },
        201,
      );
    },
  );
}
