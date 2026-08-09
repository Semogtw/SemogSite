import type {
  AttentionLifecycleContext,
  AttentionLifecycleInput,
  AttentionLifecycleResult,
} from "@semogtw/domain";
import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { z } from "zod";
import type { ApiEnvironment } from "../../middleware/request-context";

const MAX_ATTENTION_LIFECYCLE_BODY_BYTES = 8 * 1024;
const AttentionLifecycleSchema = z.object({
  attentionId: z.string().max(200),
  targetStatus: z.enum(["resolved", "dismissed"]),
  reason: z.string().max(2_000),
  confirmed: z.boolean(),
});

export interface PrivateAttentionLifecycleCommands {
  transition(
    input: AttentionLifecycleInput,
    context: AttentionLifecycleContext,
  ): Promise<AttentionLifecycleResult>;
}

function isJsonRequest(contentType: string | undefined): boolean {
  if (contentType === undefined) return false;
  const mediaType = contentType.split(";", 1)[0]?.trim().toLowerCase();
  return mediaType === "application/json" || mediaType?.endsWith("+json") === true;
}

const limitLifecycleBody = bodyLimit({
  maxSize: MAX_ATTENTION_LIFECYCLE_BODY_BYTES,
  onError: (context) => {
    context.header("cache-control", "no-store, private");
    return context.json(
      {
        ok: false,
        error: {
          code: "PAYLOAD_TOO_LARGE",
          message: "Não foi possível atualizar este item.",
          correlationId: context.get("correlationId"),
        },
      },
      413,
    );
  },
});

export function createPrivateAttentionLifecycleRoutes(
  commands?: PrivateAttentionLifecycleCommands,
) {
  return new Hono<ApiEnvironment>({ strict: false }).post(
    "/transition",
    limitLifecycleBody,
    async (context) => {
      context.header("cache-control", "no-store, private");

      if (!isJsonRequest(context.req.header("content-type"))) {
        return context.json(
          {
            ok: false,
            error: {
              code: "INVALID_REQUEST",
              message: "Não foi possível atualizar este item.",
              correlationId: context.get("correlationId"),
            },
          },
          400,
        );
      }

      const parsed = AttentionLifecycleSchema.safeParse(
        await context.req.json().catch(() => null),
      );
      if (!parsed.success) {
        return context.json(
          {
            ok: false,
            error: {
              code: "INVALID_REQUEST",
              message: "Não foi possível atualizar este item.",
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

      let result: AttentionLifecycleResult;
      try {
        result = await commands.transition(parsed.data, {
          actorId: owner.id,
          auditId: crypto.randomUUID(),
          correlationId: context.get("correlationId"),
          now: new Date().toISOString(),
        });
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
                message: "Informe um motivo válido e confirme a alteração.",
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
                message: "Este item não existe mais.",
                correlationId: context.get("correlationId"),
              },
            },
            404,
          );
        }
        return context.json(
          {
            ok: false,
            error: {
              code: result.code,
              message:
                result.code === "ALREADY_FINAL"
                  ? "Este item já foi finalizado."
                  : "O item mudou desde a última leitura. Atualize e tente novamente.",
              correlationId: context.get("correlationId"),
            },
          },
          409,
        );
      }

      return context.json({
        ok: true,
        data: {
          attentionId: result.attention.id,
          status: result.attention.status,
        },
      });
    },
  );
}
