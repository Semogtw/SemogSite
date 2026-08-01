import {
  SqliteCooperativeRunCheckpointRepository,
  type SqliteDatabase,
} from "@semogtw/database";
import { CooperativeRunCheckpointService } from "@semogtw/domain";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { getNodeDatabase } from "./node-database.server";
import { requireMutationOwner } from "./require-mutation-owner.server";

const RecordCooperativeRunCheckpointSchema = z.object({
  csrfToken: z.string().min(1).max(500),
  runId: z.string().trim().min(1).max(200),
  expectedUpdatedAt: z.string().datetime({ offset: true }),
  idempotencyKey: z.string().uuid(),
  progress: z.number().int().min(0).max(100),
  phase: z.string().trim().min(1).max(200).nullable(),
  branch: z.string().trim().min(1).max(255).nullable(),
  summary: z.string().trim().min(1).max(2_000),
  commits: z.array(z.string().trim().min(7).max(64)).max(100),
  testsStatus: z.enum(["not_run", "partial", "passed", "failed", "blocked"]),
  testsSummary: z.string().trim().min(1).max(2_000),
  blockers: z.string().trim().max(2_000),
  nextStep: z.string().trim().min(1).max(1_000),
  confirmed: z.literal(true),
});

type CheckpointInput = z.infer<typeof RecordCooperativeRunCheckpointSchema>;

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

async function sourceHash(data: CheckpointInput): Promise<string> {
  const canonical = JSON.stringify({
    idempotencyKey: data.idempotencyKey,
    runId: data.runId,
    progress: data.progress,
    phase: data.phase,
    branch: data.branch,
    summary: data.summary,
    commits: data.commits.map((commit) => commit.toLowerCase()).sort(),
    testsStatus: data.testsStatus,
    testsSummary: data.testsSummary,
    blockers: data.blockers,
    nextStep: data.nextStep,
  });
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(canonical),
  );
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

const failureMessages = {
  RUN_NOT_FOUND: "A execução não existe mais.",
  STALE_STATE: "O estado foi atualizado. Recarregue antes de registrar o checkpoint.",
  TERMINAL_RUN: "Execuções finalizadas não recebem checkpoints.",
  DUPLICATE: "Este checkpoint já foi registrado.",
  CONFLICT: "O estado mudou durante a gravação. Nenhum checkpoint parcial foi criado.",
  INVALID_CURRENT_STATE: "O estado persistido não satisfaz as invariantes do ledger.",
} as const;

export const recordCooperativeRunCheckpointFn = createServerFn({ method: "POST" })
  .validator(RecordCooperativeRunCheckpointSchema)
  .handler(async ({ data }) => {
    const owner = await requireMutationOwner(data.csrfToken);
    if (owner === null) {
      return {
        ok: false as const,
        code: "MUTATION_NOT_AUTHORIZED" as const,
        message: "Não foi possível autorizar este checkpoint.",
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
    const persistedKey = `owner-run-checkpoint-${stableKey}`;
    if (alreadyApplied(database, data.runId, persistedKey)) {
      return {
        ok: false as const,
        code: "DUPLICATE" as const,
        message: failureMessages.DUPLICATE,
      };
    }

    const service = new CooperativeRunCheckpointService(
      new SqliteCooperativeRunCheckpointRepository(database),
    );

    try {
      const result = await service.record(
        {
          runId: data.runId,
          progress: data.progress,
          phase: data.phase,
          branch: data.branch,
          summary: data.summary,
          commits: data.commits,
          testsStatus: data.testsStatus,
          testsSummary: data.testsSummary,
          blockers: data.blockers,
          nextStep: data.nextStep,
        },
        {
          actorId: owner.id,
          eventId: `run-event-owner-checkpoint-${stableKey}`,
          checkpointId: `run-checkpoint-${stableKey}`,
          idempotencyKey: persistedKey,
          correlationId: `correlation-owner-checkpoint-${stableKey}`,
          sourceHash: await sourceHash(data),
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
            message: "Revise commits, testes, branch e próximo passo.",
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
        message: "Checkpoint e evidência registrados atomicamente.",
        checkpoint: {
          id: result.checkpoint.id,
          progress: result.checkpoint.progress,
          testsStatus: result.checkpoint.testsStatus,
          capturedAt: result.checkpoint.capturedAt,
        },
      };
    } catch {
      return {
        ok: false as const,
        code: "RUN_CHECKPOINT_FAILED" as const,
        message:
          "O checkpoint não pôde ser registrado. Nenhum estado parcial foi confirmado.",
      };
    }
  });
