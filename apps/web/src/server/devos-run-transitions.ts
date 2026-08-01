import {
  SqliteCooperativeRunTransitionRepository,
  type SqliteDatabase,
} from "@semogtw/database";
import { CooperativeRunTransitionService } from "@semogtw/domain";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { getNodeDatabase } from "./node-database.server";
import { requireMutationOwner } from "./require-mutation-owner.server";

const common = {
  csrfToken: z.string().min(1).max(500),
  runId: z.string().trim().min(1).max(200),
  expectedUpdatedAt: z.string().datetime({ offset: true }),
  idempotencyKey: z.string().uuid(),
  confirmed: z.literal(true),
} as const;

const TransitionCooperativeRunSchema = z.discriminatedUnion("kind", [
  z.object({
    ...common,
    kind: z.literal("heartbeat"),
    summary: z.string().trim().min(1).max(2_000).nullable(),
    phase: z.string().trim().min(1).max(200).nullable(),
    branch: z.string().trim().min(1).max(255).nullable(),
    nextAction: z.string().trim().min(1).max(1_000).nullable(),
  }),
  z.object({
    ...common,
    kind: z.literal("checkpoint"),
    progress: z.number().int().min(0).max(100).nullable(),
    summary: z.string().trim().min(1).max(2_000),
    phase: z.string().trim().min(1).max(200).nullable(),
    branch: z.string().trim().min(1).max(255).nullable(),
    nextAction: z.string().trim().min(1).max(1_000),
  }),
  z.object({
    ...common,
    kind: z.literal("block"),
    progress: z.number().int().min(0).max(100).nullable(),
    blocker: z.string().trim().min(1).max(2_000),
    nextAction: z.string().trim().min(1).max(1_000),
    summary: z.string().trim().min(1).max(2_000).nullable(),
  }),
  z.object({
    ...common,
    kind: z.literal("resume"),
    progress: z.number().int().min(0).max(100).nullable(),
    summary: z.string().trim().min(1).max(2_000),
    phase: z.string().trim().min(1).max(200).nullable(),
    branch: z.string().trim().min(1).max(255).nullable(),
    nextAction: z.string().trim().min(1).max(1_000),
  }),
  z.object({
    ...common,
    kind: z.literal("complete"),
    progress: z.literal(100),
    summary: z.string().trim().min(1).max(2_000),
  }),
  z.object({
    ...common,
    kind: z.literal("fail"),
    reason: z.string().trim().min(1).max(2_000),
    summary: z.string().trim().min(1).max(2_000),
  }),
  z.object({
    ...common,
    kind: z.literal("cancel"),
    reason: z.string().trim().min(1).max(2_000),
    summary: z.string().trim().min(1).max(2_000).nullable(),
  }),
]);

type TransitionInput = z.infer<typeof TransitionCooperativeRunSchema>;

function transitionCommand(data: TransitionInput) {
  if (data.kind === "heartbeat") {
    return {
      kind: data.kind,
      ...(data.summary === null ? {} : { summary: data.summary }),
      phase: data.phase,
      branch: data.branch,
      ...(data.nextAction === null ? {} : { nextAction: data.nextAction }),
    } as const;
  }
  if (data.kind === "checkpoint") {
    return {
      kind: data.kind,
      ...(data.progress === null ? {} : { progress: data.progress }),
      summary: data.summary,
      phase: data.phase,
      branch: data.branch,
      nextAction: data.nextAction,
    } as const;
  }
  if (data.kind === "block") {
    return {
      kind: data.kind,
      ...(data.progress === null ? {} : { progress: data.progress }),
      blocker: data.blocker,
      nextAction: data.nextAction,
      ...(data.summary === null ? {} : { summary: data.summary }),
    } as const;
  }
  if (data.kind === "resume") {
    return {
      kind: data.kind,
      ...(data.progress === null ? {} : { progress: data.progress }),
      summary: data.summary,
      phase: data.phase,
      branch: data.branch,
      nextAction: data.nextAction,
    } as const;
  }
  if (data.kind === "complete") {
    return { kind: data.kind, progress: data.progress, summary: data.summary } as const;
  }
  if (data.kind === "fail") {
    return { kind: data.kind, reason: data.reason, summary: data.summary } as const;
  }
  return {
    kind: data.kind,
    reason: data.reason,
    ...(data.summary === null ? {} : { summary: data.summary }),
  } as const;
}

function alreadyApplied(
  database: SqliteDatabase,
  runId: string,
  idempotencyKey: string,
): boolean {
  return (
    database.$client
      .prepare(
        `SELECT id FROM cooperative_run_events
         WHERE run_id = ? AND idempotency_key = ?`,
      )
      .get(runId, idempotencyKey) !== undefined
  );
}

const failureMessages = {
  RUN_NOT_FOUND: "A execução não existe mais.",
  STALE_STATE: "O estado foi atualizado. Recarregue antes de tentar novamente.",
  TERMINAL_RUN: "A execução já está em estado terminal.",
  DUPLICATE: "Esta transição já foi registrada.",
  CONFLICT: "O estado mudou durante a gravação. Nenhuma transição parcial foi criada.",
  INVALID_CURRENT_STATE: "O estado persistido não satisfaz as invariantes do ledger.",
} as const;

export const transitionCooperativeRunFn = createServerFn({ method: "POST" })
  .validator(TransitionCooperativeRunSchema)
  .handler(async ({ data }) => {
    const owner = await requireMutationOwner(data.csrfToken);
    if (owner === null) {
      return {
        ok: false as const,
        code: "MUTATION_NOT_AUTHORIZED" as const,
        message: "Não foi possível autorizar esta transição.",
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

    const stableKey = data.idempotencyKey;
    const persistedKey = `owner-run-transition-${stableKey}`;
    if (alreadyApplied(database, data.runId, persistedKey)) {
      return {
        ok: false as const,
        code: "DUPLICATE" as const,
        message: failureMessages.DUPLICATE,
      };
    }

    const service = new CooperativeRunTransitionService(
      new SqliteCooperativeRunTransitionRepository(database),
    );

    try {
      const result = await service.transition(
        { runId: data.runId, command: transitionCommand(data) },
        {
          actorId: owner.id,
          eventId: `run-event-owner-transition-${stableKey}`,
          idempotencyKey: persistedKey,
          correlationId: `correlation-owner-transition-${stableKey}`,
          source: "manual",
          now: new Date().toISOString(),
          expectedUpdatedAt: data.expectedUpdatedAt,
        },
      );

      if (!result.ok) {
        if (result.code === "VALIDATION_FAILED") {
          return {
            ok: false as const,
            code: result.code,
            message: "A transição não satisfaz as invariantes do run.",
            errors: result.errors,
          };
        }
        if (result.code === "INVALID_CURRENT_STATE") {
          return {
            ok: false as const,
            code: result.code,
            message: failureMessages.INVALID_CURRENT_STATE,
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
        message: "Transição registrada no ledger cooperativo.",
        run: {
          id: result.run.id,
          status: result.run.status,
          progress: result.run.progress,
          updatedAt: result.run.updatedAt,
        },
      };
    } catch {
      return {
        ok: false as const,
        code: "RUN_TRANSITION_FAILED" as const,
        message:
          "A transição não pôde ser registrada. Nenhum estado parcial foi confirmado.",
      };
    }
  });
