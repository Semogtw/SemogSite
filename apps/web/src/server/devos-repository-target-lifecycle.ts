import { SqliteRepositoryTargetLifecycleRepository } from "@semogtw/database";
import { RepositoryTargetLifecycleService } from "@semogtw/domain";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { getNodeDatabase } from "./node-database.server";
import { requireMutationOwner } from "./require-mutation-owner.server";

const ChangeRepositoryTargetSchema = z.object({
  csrfToken: z.string().min(1),
  repositoryId: z.string().trim().min(1).max(200),
  desiredSyncEnabled: z.boolean(),
  expectedSyncEnabled: z.boolean(),
  expectedUpdatedAt: z.string().min(1).max(100),
  reason: z.string().trim().min(1).max(500),
  confirmed: z.literal(true),
});

const failureMessages = {
  REPOSITORY_NOT_FOUND: "O repositório não existe mais.",
  STALE_STATE:
    "O estado do alvo mudou desde que esta tela foi carregada. Revise o painel.",
  ALREADY_APPLIED: "O alvo já está no estado solicitado.",
  CONFLICT:
    "O estado mudou durante a decisão. Nenhuma alteração foi confirmada.",
} as const;

export const changeRepositoryTargetLifecycleFn = createServerFn({
  method: "POST",
})
  .validator(ChangeRepositoryTargetSchema)
  .handler(async ({ data }) => {
    const owner = await requireMutationOwner(data.csrfToken);
    if (owner === null) {
      return {
        ok: false as const,
        code: "MUTATION_NOT_AUTHORIZED" as const,
        message: "Não foi possível autorizar esta alteração.",
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

    const repository = new SqliteRepositoryTargetLifecycleRepository(database);
    const service = new RepositoryTargetLifecycleService(repository);
    const now = new Date().toISOString();

    try {
      const result = await service.change(
        {
          repositoryId: data.repositoryId,
          desiredSyncEnabled: data.desiredSyncEnabled,
          expectedSyncEnabled: data.expectedSyncEnabled,
          expectedUpdatedAt: data.expectedUpdatedAt,
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
            message: "Revise o motivo, a confirmação e o estado observado.",
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
        message: result.target.syncEnabled
          ? `${result.target.fullName} voltou a participar das sincronizações.`
          : `${result.target.fullName} foi pausado sem apagar o histórico.`,
        target: result.target,
        auditId: result.audit.id,
      };
    } catch {
      return {
        ok: false as const,
        code: "REPOSITORY_TARGET_LIFECYCLE_FAILED" as const,
        message:
          "O estado do alvo não pôde ser alterado. O valor anterior foi preservado.",
      };
    }
  });
