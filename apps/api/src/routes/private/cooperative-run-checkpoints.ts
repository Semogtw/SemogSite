import type { CooperativeRunCheckpointService } from "@semogtw/domain";
import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { z } from "zod";
import type { ApiEnvironment } from "../../middleware/request-context";

const MAX_RUN_CHECKPOINT_BODY_BYTES = 32 * 1024;

const CheckpointSchema = z.object({
  idempotencyKey: z.string().uuid(),
  runId: z.string().trim().min(1).max(200),
  expectedUpdatedAt: z.string().datetime({ offset: true }),
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

type CheckpointRequest = z.infer<typeof CheckpointSchema>;

export type PrivateCooperativeRunCheckpointCommands = Pick<
  CooperativeRunCheckpointService,
  "record"
>;

function isJsonRequest(contentType: string | undefined): boolean {
  if (contentType === undefined) return false;
  const mediaType = contentType.split(";", 1)[0]?.trim().toLowerCase();
  return mediaType === "application/json" || mediaType?.endsWith("+json") === true;
}

async function sourceHash(data: CheckpointRequest): Promise<string> {
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

function failureStatus(code: string): 400 | 404 | 409 {
  if (code === "VALIDATION_FAILED") return 400;
  if (code === "RUN_NOT_FOUND") return 404;
  return 409;
}

function failureMessage(code: string): string {
  if (code === "VALIDATION_FAILED") {
    return "Revise commits, testes, branch e próximo passo.";
  }
  if (code === "RUN_NOT_FOUND") return "A execução não existe mais.";
  if (code === "STALE_STATE") {
    return "O estado foi atualizado. Recarregue antes de registrar o checkpoint.";
  }
  if (code === "TERMINAL_RUN") {
    return "Execuções finalizadas não recebem checkpoints.";
  }
  if (code === "DUPLICATE") return "Este checkpoint já foi registrado.";
  if (code === "INVALID_CURRENT_STATE") {
    return "O estado persistido não satisfaz as invariantes do ledger.";
  }
  return "O estado mudou durante a gravação. Nenhum checkpoint parcial foi criado.";
}

const limitBody = bodyLimit({
  maxSize: MAX_RUN_CHECKPOINT_BODY_BYTES,
  onError: (context) => {
    context.header("cache-control", "no-store, private");
    return context.json(
      {
        ok: false,
        error: {
          code: "PAYLOAD_TOO_LARGE",
          message: "Não foi possível registrar este checkpoint.",
          correlationId: context.get("correlationId"),
        },
      },
      413,
    );
  },
});

export function createPrivateCooperativeRunCheckpointRoutes(
  commands?: PrivateCooperativeRunCheckpointCommands,
) {
  return new Hono<ApiEnvironment>({ strict: false }).post(
    "/checkpoint",
    limitBody,
    async (context) => {
      context.header("cache-control", "no-store, private");
      if (!isJsonRequest(context.req.header("content-type"))) {
        return context.json(
          {
            ok: false,
            error: {
              code: "INVALID_REQUEST",
              message: "Não foi possível registrar este checkpoint.",
              correlationId: context.get("correlationId"),
            },
          },
          400,
        );
      }

      const parsed = CheckpointSchema.safeParse(
        await context.req.json().catch(() => null),
      );
      if (!parsed.success) {
        return context.json(
          {
            ok: false,
            error: {
              code: "INVALID_REQUEST",
              message: "Não foi possível registrar este checkpoint.",
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
              message: "Não foi possível registrar este checkpoint.",
              correlationId: context.get("correlationId"),
            },
          },
          503,
        );
      }

      const stableKey = parsed.data.idempotencyKey;
      let result: Awaited<ReturnType<PrivateCooperativeRunCheckpointCommands["record"]>>;
      try {
        result = await commands.record(
          {
            runId: parsed.data.runId,
            progress: parsed.data.progress,
            phase: parsed.data.phase,
            branch: parsed.data.branch,
            summary: parsed.data.summary,
            commits: parsed.data.commits,
            testsStatus: parsed.data.testsStatus,
            testsSummary: parsed.data.testsSummary,
            blockers: parsed.data.blockers,
            nextStep: parsed.data.nextStep,
          },
          {
            actorId: owner.id,
            eventId: `run-event-owner-checkpoint-${stableKey}`,
            checkpointId: `run-checkpoint-${stableKey}`,
            idempotencyKey: `owner-run-checkpoint-${stableKey}`,
            correlationId: `correlation-owner-checkpoint-${stableKey}`,
            sourceHash: await sourceHash(parsed.data),
            source: "manual",
            now: new Date().toISOString(),
            expectedUpdatedAt: parsed.data.expectedUpdatedAt,
          },
        );
      } catch {
        return context.json(
          {
            ok: false,
            error: {
              code: "STORAGE_UNAVAILABLE",
              message: "Não foi possível registrar este checkpoint.",
              correlationId: context.get("correlationId"),
            },
          },
          503,
        );
      }

      if (!result.ok) {
        const details = "errors" in result ? result.errors : undefined;
        return context.json(
          {
            ok: false,
            error: {
              code: result.code,
              message: failureMessage(result.code),
              ...(details === undefined ? {} : { details }),
              correlationId: context.get("correlationId"),
            },
          },
          failureStatus(result.code),
        );
      }

      return context.json({
        ok: true,
        data: {
          runId: result.run.id,
          checkpointId: result.checkpoint.id,
          progress: result.checkpoint.progress,
          testsStatus: result.checkpoint.testsStatus,
          capturedAt: result.checkpoint.capturedAt,
          updatedAt: result.run.updatedAt,
          processStarted: false,
        },
      });
    },
  );
}
