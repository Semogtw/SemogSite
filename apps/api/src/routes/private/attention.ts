import type {
  CaptureAttentionInput,
  CaptureAttentionResult,
  CaptureContext,
} from "@semogtw/domain";
import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { z } from "zod";
import type { ApiEnvironment } from "../../middleware/request-context";

const MAX_CAPTURE_BODY_BYTES = 8 * 1024;

const CaptureAttentionSchema = z.object({
  type: z.enum([
    "blocker",
    "risk",
    "decision",
    "external_dependency",
    "critical_test",
  ]),
  impact: z.enum(["high", "medium", "low"]),
  title: z.string().max(1_000),
  nextAction: z.string().max(2_000),
  reason: z.string().max(2_000),
  confirmed: z.boolean(),
});

export interface PrivateAttentionCommands {
  capture(
    input: CaptureAttentionInput,
    context: CaptureContext,
  ): Promise<CaptureAttentionResult>;
}

function isJsonRequest(contentType: string | undefined): boolean {
  if (contentType === undefined) return false;
  const mediaType = contentType.split(";", 1)[0]?.trim().toLowerCase();
  return mediaType === "application/json" || mediaType?.endsWith("+json") === true;
}

const limitCaptureBody = bodyLimit({
  maxSize: MAX_CAPTURE_BODY_BYTES,
  onError: (context) => {
    context.header("cache-control", "no-store, private");
    return context.json(
      {
        ok: false,
        error: {
          code: "PAYLOAD_TOO_LARGE",
          message: "Não foi possível registrar esta atenção.",
          correlationId: context.get("correlationId"),
        },
      },
      413,
    );
  },
});

export function createPrivateAttentionRoutes(
  commands?: PrivateAttentionCommands,
) {
  return new Hono<ApiEnvironment>({ strict: false }).post(
    "/",
    limitCaptureBody,
    async (context) => {
      context.header("cache-control", "no-store, private");

      if (!isJsonRequest(context.req.header("content-type"))) {
        return context.json(
          {
            ok: false,
            error: {
              code: "INVALID_REQUEST",
              message: "Não foi possível registrar esta atenção.",
              correlationId: context.get("correlationId"),
            },
          },
          400,
        );
      }

      const parsed = CaptureAttentionSchema.safeParse(
        await context.req.json().catch(() => null),
      );
      if (!parsed.success) {
        return context.json(
          {
            ok: false,
            error: {
              code: "INVALID_REQUEST",
              message: "Não foi possível registrar esta atenção.",
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

      let result: CaptureAttentionResult;
      try {
        result = await commands.capture(
          {
            projectId: null,
            type: parsed.data.type,
            impact: parsed.data.impact,
            title: parsed.data.title,
            nextAction: parsed.data.nextAction,
            reason: parsed.data.reason,
            confirmed: parsed.data.confirmed,
          },
          {
            actorId: owner.id,
            attentionId: crypto.randomUUID(),
            auditId: crypto.randomUUID(),
            correlationId: context.get("correlationId"),
            now: new Date().toISOString(),
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
              message: "Revise os campos antes de salvar.",
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
          data: {
            attentionId: result.attention.id,
          },
        },
        201,
      );
    },
  );
}
