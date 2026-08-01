import { SqliteCooperativeRunCommandQueueRepository } from "@semogtw/database";
import { CooperativeRunCommandQueueService } from "@semogtw/domain";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { getNodeDatabase } from "./node-database.server";
import { requireMutationOwner } from "./require-mutation-owner.server";

const common = {
  csrfToken: z.string().min(1).max(500),
  runId: z.string().trim().min(1).max(200),
  summary: z.string().trim().min(1).max(1_000),
  expiresAt: z.string().datetime({ offset: true }).nullable(),
  idempotencyKey: z.string().uuid(),
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

function commandPayload(data: z.infer<typeof QueueRunCommandSchema>): unknown {
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

const failureMessages = {
  RUN_NOT_FOUND: "A execução não existe mais.",
  TERMINAL_RUN: "Execuções finalizadas não recebem novos comandos.",
  DUPLICATE: "Este comando já foi enfileirado.",
  CONFLICT: "O estado mudou durante a gravação. Nenhum comando parcial foi criado.",
} as const;

export const queueCooperativeRunCommandFn = createServerFn({ method: "POST" })
  .validator(QueueRunCommandSchema)
  .handler(async ({ data }) => {
    const owner = await requireMutationOwner(data.csrfToken);
    if (owner === null) {
      return {
        ok: false as const,
        code: "MUTATION_NOT_AUTHORIZED" as const,
        message: "Não foi possível autorizar este comando.",
      };
    }

    const database = await getNodeDatabase();
    if (database === null) {
      return {
        ok: false as const,
        code: "STORAGE_UNAVAILABLE" as const,
        message: "O armazenamento privado está indisponível.",
      };
    }

    const repository = new SqliteCooperativeRunCommandQueueRepository(database);
    const service = new CooperativeRunCommandQueueService(repository);
    const now = new Date().toISOString();

    try {
      const result = await service.queue(
        {
          runId: data.runId,
          kind: data.kind,
          summary: data.summary,
          payload: commandPayload(data),
          expiresAt: data.expiresAt,
        },
        {
          actorId: owner.id,
          commandId: `run-command-${crypto.randomUUID()}`,
          eventId: `run-event-${crypto.randomUUID()}`,
          idempotencyKey: `owner-command-${data.idempotencyKey}`,
          correlationId: `correlation-${crypto.randomUUID()}`,
          source: "manual",
          now,
        },
      );

      if (!result.ok) {
        if (result.code === "VALIDATION_FAILED") {
          return {
            ok: false as const,
            code: result.code,
            message: "Revise o tipo, os detalhes e a expiração do comando.",
            errors: result.errors,
          };
        }
        return {
          ok: false as const,
          code: result.code,
          message: failureMessages[result.code],
        };
      }

      return {
        ok: true as const,
        message:
          "Comando enfileirado. O agente só o receberá quando consultar o DevOS.",
        command: {
          id: result.command.id,
          kind: result.command.kind,
          status: result.command.status,
          queuedAt: result.command.queuedAt,
        },
      };
    } catch {
      return {
        ok: false as const,
        code: "RUN_COMMAND_QUEUE_FAILED" as const,
        message:
          "O comando não pôde ser enfileirado. Nenhum registro parcial foi confirmado.",
      };
    }
  });
