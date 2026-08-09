import type {
  CooperativeRunTransitionService,
  RunTransitionCommand,
} from "@semogtw/domain";
import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { z } from "zod";
import type { ApiEnvironment } from "../../middleware/request-context";

const MAX_RUN_TRANSITION_BODY_BYTES = 16 * 1024;
const common = {
  idempotencyKey: z.string().uuid(),
  runId: z.string().trim().min(1).max(200),
  expectedUpdatedAt: z.string().datetime({ offset: true }),
  confirmed: z.literal(true),
} as const;

const TransitionSchema = z.discriminatedUnion("kind", [
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

type TransitionRequest = z.infer<typeof TransitionSchema>;

export type PrivateCooperativeRunTransitionCommands = Pick<
  CooperativeRunTransitionService,
  "transition"
>;

function transitionCommand(data: TransitionRequest): RunTransitionCommand {
  if (data.kind === "heartbeat") {
    return {
      kind: data.kind,
      ...(data.summary === null ? {} : { summary: data.summary }),
      phase: data.phase,
      branch: data.branch,
      ...(data.nextAction === null ? {} : { nextAction: data.nextAction }),
    };
  }
  if (data.kind === "checkpoint") {
    return {
      kind: data.kind,
      ...(data.progress === null ? {} : { progress: data.progress }),
      summary: data.summary,
      phase: data.phase,
      branch: data.branch,
      nextAction: data.nextAction,
    };
  }
  if (data.kind === "block") {
    return {
      kind: data.kind,
      ...(data.progress === null ? {} : { progress: data.progress }),
      blocker: data.blocker,
      nextAction: data.nextAction,
      ...(data.summary === null ? {} : { summary: data.summary }),
    };
  }
  if (data.kind === "resume") {
    return {
      kind: data.kind,
      ...(data.progress === null ? {} : { progress: data.progress }),
      summary: data.summary,
      phase: data.phase,
      branch: data.branch,
      nextAction: data.nextAction,
    };
  }
  if (data.kind === "complete") {
    return { kind: data.kind, progress: data.progress, summary: data.summary };
  }
  if (data.kind === "fail") {
    return { kind: data.kind, reason: data.reason, summary: data.summary };
  }
  return {
    kind: data.kind,
    reason: data.reason,
    ...(data.summary === null ? {} : { summary: data.summary }),
  };
}

function isJsonRequest(contentType: string | undefined): boolean {
  if (contentType === undefined) return false;
  const mediaType = contentType.split(";", 1)[0]?.trim().toLowerCase();
  return mediaType === "application/json" || mediaType?.endsWith("+json") === true;
}

function failureStatus(code: string): 400 | 404 | 409 {
  if (code === "VALIDATION_FAILED") return 400;
  if (code === "RUN_NOT_FOUND") return 404;
  return 409;
}

function failureMessage(code: string): string {
  if (code === "VALIDATION_FAILED") {
    return "A transição não satisfaz as invariantes do run.";
  }
  if (code === "RUN_NOT_FOUND") return "A execução não existe mais.";
  if (code === "STALE_STATE") {
    return "O estado foi atualizado. Recarregue antes de tentar novamente.";
  }
  if (code === "TERMINAL_RUN") return "A execução já está em estado terminal.";
  if (code === "DUPLICATE") return "Esta transição já foi registrada.";
  if (code === "INVALID_CURRENT_STATE") {
    return "O estado persistido não satisfaz as invariantes do ledger.";
  }
  return "O estado mudou durante a gravação. Nenhuma transição parcial foi criada.";
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

export function createPrivateCooperativeRunTransitionRoutes(
  commands?: PrivateCooperativeRunTransitionCommands,
) {
  return new Hono<ApiEnvironment>({ strict: false }).post(
    "/transition",
    limitBody,
    async (context) => {
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

      const parsed = TransitionSchema.safeParse(
        await context.req.json().catch(() => null),
      );
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
      let result: Awaited<ReturnType<PrivateCooperativeRunTransitionCommands["transition"]>>;
      try {
        result = await commands.transition(
          {
            runId: parsed.data.runId,
            command: transitionCommand(parsed.data),
          },
          {
            actorId: owner.id,
            eventId: `run-event-owner-transition-${stableKey}`,
            idempotencyKey: `owner-run-transition-${stableKey}`,
            correlationId: `correlation-owner-transition-${stableKey}`,
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
              message: "Não foi possível salvar esta atualização.",
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
          status: result.run.status,
          progress: result.run.progress,
          updatedAt: result.run.updatedAt,
          processStarted: false,
        },
      });
    },
  );
}
