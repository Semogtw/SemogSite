import type {
  AcceptBranchRecommendationInput,
  BranchRecommendationAcceptanceContext,
  BranchRecommendationAcceptanceResult,
} from "@semogtw/domain";
import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { z } from "zod";
import type { ApiEnvironment } from "../../middleware/request-context";

const MAX_BRANCH_ACCEPTANCE_BODY_BYTES = 8 * 1024;
const AcceptBranchRecommendationSchema = z.object({
  repositoryId: z.string().max(200),
  recommendationId: z.string().max(200),
  expectedActiveBranch: z.string().max(255).nullable(),
  reason: z.string().max(2_000),
  confirmed: z.boolean(),
});

export interface PrivateBranchRecommendationCommands {
  accept(
    input: AcceptBranchRecommendationInput,
    context: BranchRecommendationAcceptanceContext,
  ): Promise<BranchRecommendationAcceptanceResult>;
}

function isJsonRequest(contentType: string | undefined): boolean {
  if (contentType === undefined) return false;
  const mediaType = contentType.split(";", 1)[0]?.trim().toLowerCase();
  return mediaType === "application/json" || mediaType?.endsWith("+json") === true;
}

const limitBody = bodyLimit({
  maxSize: MAX_BRANCH_ACCEPTANCE_BODY_BYTES,
  onError: (context) => {
    context.header("cache-control", "no-store, private");
    return context.json(
      {
        ok: false,
        error: {
          code: "PAYLOAD_TOO_LARGE",
          message: "Não foi possível aceitar esta recomendação.",
          correlationId: context.get("correlationId"),
        },
      },
      413,
    );
  },
});

export function createPrivateBranchRecommendationRoutes(
  commands?: PrivateBranchRecommendationCommands,
) {
  return new Hono<ApiEnvironment>({ strict: false }).post(
    "/accept",
    limitBody,
    async (context) => {
      context.header("cache-control", "no-store, private");
      if (!isJsonRequest(context.req.header("content-type"))) {
        return context.json(
          {
            ok: false,
            error: {
              code: "INVALID_REQUEST",
              message: "Não foi possível aceitar esta recomendação.",
              correlationId: context.get("correlationId"),
            },
          },
          400,
        );
      }

      const parsed = AcceptBranchRecommendationSchema.safeParse(
        await context.req.json().catch(() => null),
      );
      if (!parsed.success) {
        return context.json(
          {
            ok: false,
            error: {
              code: "INVALID_REQUEST",
              message: "Não foi possível aceitar esta recomendação.",
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
              message: "Não foi possível salvar esta decisão.",
              correlationId: context.get("correlationId"),
            },
          },
          503,
        );
      }

      let result: BranchRecommendationAcceptanceResult;
      try {
        result = await commands.accept(parsed.data, {
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
              message: "Não foi possível salvar esta decisão.",
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
                message: "Revise o motivo e a confirmação.",
                details: result.errors,
                correlationId: context.get("correlationId"),
              },
            },
            400,
          );
        }
        if (result.code === "REPOSITORY_NOT_FOUND") {
          return context.json(
            {
              ok: false,
              error: {
                code: result.code,
                message: "O repositório não existe mais.",
                correlationId: context.get("correlationId"),
              },
            },
            404,
          );
        }
        const unavailable =
          result.code === "RECOMMENDATION_NOT_FOUND" ||
          result.code === "RECOMMENDATION_UNAVAILABLE";
        return context.json(
          {
            ok: false,
            error: {
              code: result.code,
              message: unavailable
                ? "A recomendação não está disponível."
                : result.code === "ALREADY_ACTIVE"
                  ? "A branch recomendada já está ativa."
                  : "O estado observado mudou. Atualize e tente novamente.",
              correlationId: context.get("correlationId"),
            },
          },
          unavailable ? 404 : 409,
        );
      }

      return context.json({
        ok: true,
        data: {
          repositoryId: result.candidate.repository.id,
          activeBranch: result.candidate.repository.activeBranch,
          updatedAt: result.candidate.repository.updatedAt,
          recommendationId: result.candidate.recommendation?.id ?? null,
        },
      });
    },
  );
}
