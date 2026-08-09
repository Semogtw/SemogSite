import type {
  CompleteStageInput,
  StageCompletionContext,
  StageCompletionResult,
} from "@semogtw/domain";
import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { z } from "zod";
import type { ApiEnvironment } from "../../middleware/request-context";

const MAX_STAGE_COMPLETION_BODY_BYTES = 8 * 1024;

const CompleteStageSchema = z.object({
  stageId: z.string().max(200),
  reason: z.string().max(2_000),
  confirmed: z.boolean(),
});

export interface PrivateStageCommands {
  complete(
    input: CompleteStageInput,
    context: StageCompletionContext,
  ): Promise<StageCompletionResult>;
}

function isJsonRequest(contentType: string | undefined): boolean {
  if (contentType === undefined) return false;
  const mediaType = contentType.split(";", 1)[0]?.trim().toLowerCase();
  return mediaType === "application/json" || mediaType?.endsWith("+json") === true;
}

const limitStageCompletionBody = bodyLimit({
  maxSize: MAX_STAGE_COMPLETION_BODY_BYTES,
  onError: (context) => {
    context.header("cache-control", "no-store, private");
    return context.json(
      {
        ok: false,
        error: {
          code: "PAYLOAD_TOO_LARGE",
          message: "Não foi possível concluir esta etapa.",
          correlationId: context.get("correlationId"),
        },
      },
      413,
    );
  },
});

export function createPrivateStageRoutes(commands?: PrivateStageCommands) {
  return new Hono<ApiEnvironment>({ strict: false }).post(
    "/complete",
    limitStageCompletionBody,
    async (context) => {
      context.header("cache-control", "no-store, private");

      if (!isJsonRequest(context.req.header("content-type"))) {
        return context.json(
          {
            ok: false,
            error: {
              code: "INVALID_REQUEST",
              message: "Não foi possível concluir esta etapa.",
              correlationId: context.get("correlationId"),
            },
          },
          400,
        );
      }

      const parsed = CompleteStageSchema.safeParse(
        await context.req.json().catch(() => null),
      );
      if (!parsed.success) {
        return context.json(
          {
            ok: false,
            error: {
              code: "INVALID_REQUEST",
              message: "Não foi possível concluir esta etapa.",
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

      let result: StageCompletionResult;
      try {
        result = await commands.complete(
          {
            stageId: parsed.data.stageId,
            reason: parsed.data.reason,
            confirmed: parsed.data.confirmed,
          },
          {
            actorId: owner.id,
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
        if (result.code === "VALIDATION_FAILED") {
          return context.json(
            {
              ok: false,
              error: {
                code: result.code,
                message: "Informe um motivo válido e confirme a conclusão.",
                details: result.errors,
                correlationId: context.get("correlationId"),
              },
            },
            400,
          );
        }

        if (result.code === "NOT_FOUND") {
          return context.json(
            {
              ok: false,
              error: {
                code: result.code,
                message: "Esta etapa não existe mais.",
                correlationId: context.get("correlationId"),
              },
            },
            404,
          );
        }

        if (result.code === "INVARIANT_FAILED") {
          return context.json(
            {
              ok: false,
              error: {
                code: result.code,
                message: "A etapa ainda não satisfaz os critérios de conclusão.",
                details: result.errors,
                correlationId: context.get("correlationId"),
              },
            },
            409,
          );
        }

        return context.json(
          {
            ok: false,
            error: {
              code: result.code,
              message:
                result.code === "ALREADY_COMPLETED"
                  ? "Esta etapa já foi concluída."
                  : "A etapa mudou desde a última leitura. Atualize e tente novamente.",
              correlationId: context.get("correlationId"),
            },
          },
          409,
        );
      }

      return context.json({
        ok: true,
        data: {
          stageId: result.stage.id,
        },
      });
    },
  );
}
