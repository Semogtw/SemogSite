import type {
  RecordSessionHandoffInput,
  SessionHandoffContext,
  SessionHandoffResult,
} from "@semogtw/domain";
import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { z } from "zod";
import type { ApiEnvironment } from "../../middleware/request-context";

const MAX_HANDOFF_BODY_BYTES = 32 * 1024;

const SessionHandoffSchema = z.object({
  projectId: z.string().max(200).nullable(),
  title: z.string().max(1_000),
  branch: z.string().max(1_000).nullable(),
  commits: z.array(z.string().max(100)).max(100),
  completedSummary: z.string().max(10_000),
  testsStatus: z.enum(["not_run", "partial", "passed", "failed", "blocked"]),
  testsSummary: z.string().max(5_000),
  blockers: z.string().max(5_000),
  nextStep: z.string().max(2_000),
  result: z.enum([
    "significant",
    "partial",
    "maintenance",
    "no_change",
    "failed",
  ]),
  reason: z.string().max(2_000),
  confirmed: z.boolean(),
});

export interface PrivateSessionHandoffCommands {
  record(
    input: RecordSessionHandoffInput,
    context: SessionHandoffContext,
  ): Promise<SessionHandoffResult>;
}

function isJsonRequest(contentType: string | undefined): boolean {
  if (contentType === undefined) return false;
  const mediaType = contentType.split(";", 1)[0]?.trim().toLowerCase();
  return mediaType === "application/json" || mediaType?.endsWith("+json") === true;
}

const limitHandoffBody = bodyLimit({
  maxSize: MAX_HANDOFF_BODY_BYTES,
  onError: (context) => {
    context.header("cache-control", "no-store, private");
    return context.json(
      {
        ok: false,
        error: {
          code: "PAYLOAD_TOO_LARGE",
          message: "Não foi possível registrar este handoff.",
          correlationId: context.get("correlationId"),
        },
      },
      413,
    );
  },
});

export function createPrivateSessionHandoffRoutes(
  commands?: PrivateSessionHandoffCommands,
) {
  return new Hono<ApiEnvironment>({ strict: false }).post(
    "/",
    limitHandoffBody,
    async (context) => {
      context.header("cache-control", "no-store, private");

      if (!isJsonRequest(context.req.header("content-type"))) {
        return context.json(
          {
            ok: false,
            error: {
              code: "INVALID_REQUEST",
              message: "Não foi possível registrar este handoff.",
              correlationId: context.get("correlationId"),
            },
          },
          400,
        );
      }

      const parsed = SessionHandoffSchema.safeParse(
        await context.req.json().catch(() => null),
      );
      if (!parsed.success) {
        return context.json(
          {
            ok: false,
            error: {
              code: "INVALID_REQUEST",
              message: "Não foi possível registrar este handoff.",
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
              message: "Não foi possível salvar esta alteração.",
              correlationId: context.get("correlationId"),
            },
          },
          503,
        );
      }

      const now = new Date().toISOString();
      let result: SessionHandoffResult;
      try {
        result = await commands.record(
          {
            projectId: parsed.data.projectId,
            title: parsed.data.title,
            sessionDate: now,
            branch: parsed.data.branch,
            commits: parsed.data.commits,
            completedSummary: parsed.data.completedSummary,
            testsStatus: parsed.data.testsStatus,
            testsSummary: parsed.data.testsSummary,
            blockers: parsed.data.blockers,
            nextStep: parsed.data.nextStep,
            result: parsed.data.result,
            reason: parsed.data.reason,
            confirmed: parsed.data.confirmed,
          },
          {
            actorId: owner.id,
            sessionId: crypto.randomUUID(),
            auditId: crypto.randomUUID(),
            correlationId: context.get("correlationId"),
            now,
          },
        );
      } catch {
        return context.json(
          {
            ok: false,
            error: {
              code: "STORAGE_UNAVAILABLE",
              message: "Não foi possível salvar esta alteração.",
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
              code: "VALIDATION_FAILED",
              message: "Revise os campos do handoff antes de salvar.",
              details: result.errors,
              correlationId: context.get("correlationId"),
            },
          },
          400,
        );
      }

      return context.json(
        {
          ok: true,
          data: { sessionId: result.session.id },
        },
        201,
      );
    },
  );
}
