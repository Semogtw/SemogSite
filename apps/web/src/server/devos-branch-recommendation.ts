import { SqliteBranchRecommendationAcceptanceRepository } from "@semogtw/database";
import { BranchRecommendationAcceptanceService } from "@semogtw/domain";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { getNodeDatabase } from "./node-database.server";
import { requireMutationOwner } from "./require-mutation-owner.server";

const AcceptBranchRecommendationSchema = z.object({
  csrfToken: z.string().min(1),
  repositoryId: z.string().trim().min(1).max(200),
  recommendationId: z.string().trim().min(1).max(200),
  expectedActiveBranch: z.string().trim().max(255).nullable(),
  reason: z.string().trim().min(1).max(500),
  confirmed: z.literal(true),
});

const failureMessages = {
  REPOSITORY_NOT_FOUND: "O repositório não existe mais.",
  RECOMMENDATION_NOT_FOUND: "Nenhuma recomendação está disponível.",
  STALE_RECOMMENDATION:
    "Uma recomendação mais recente foi observada. Revise o painel antes de aceitar.",
  RECOMMENDATION_UNAVAILABLE:
    "A observação atual não possui branch recomendável.",
  STALE_ACTIVE_BRANCH:
    "A branch ativa mudou desde que esta tela foi carregada.",
  ALREADY_ACTIVE: "A branch recomendada já está ativa no DevOS.",
  CONFLICT:
    "O estado mudou durante a decisão. Nenhuma alteração foi confirmada.",
} as const;

export const acceptBranchRecommendationFn = createServerFn({ method: "POST" })
  .validator(AcceptBranchRecommendationSchema)
  .handler(async ({ data }) => {
    const owner = await requireMutationOwner(data.csrfToken);
    if (owner === null) {
      return {
        ok: false as const,
        code: "MUTATION_NOT_AUTHORIZED" as const,
        message: "Não foi possível autorizar esta decisão.",
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

    const repository = new SqliteBranchRecommendationAcceptanceRepository(
      database,
    );
    const service = new BranchRecommendationAcceptanceService(repository);
    const now = new Date().toISOString();
    try {
      const result = await service.accept(
        {
          repositoryId: data.repositoryId,
          recommendationId: data.recommendationId,
          expectedActiveBranch: data.expectedActiveBranch,
          reason: data.reason,
          confirmed: data.confirmed,
        },
        {
          actorId: owner.id,
          auditId: `audit-${crypto.randomUUID()}`,
          correlationId: `correlation-${crypto.randomUUID()}`,
          now,
        },
      );

      if (!result.ok) {
        if (result.code === "VALIDATION_FAILED") {
          return {
            ok: false as const,
            code: result.code,
            message: "Revise a confirmação e o motivo informado.",
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
        message: `A branch ${result.candidate.repository.activeBranch} foi aceita como ativa no DevOS.`,
        repository: {
          id: result.candidate.repository.id,
          activeBranch: result.candidate.repository.activeBranch,
          updatedAt: result.candidate.repository.updatedAt,
        },
        auditId: result.audit.id,
      };
    } catch {
      return {
        ok: false as const,
        code: "BRANCH_ACCEPTANCE_FAILED" as const,
        message:
          "A decisão não pôde ser persistida. A branch ativa permaneceu inalterada.",
      };
    }
  });
