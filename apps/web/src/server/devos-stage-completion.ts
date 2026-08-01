import { StageCompletionService } from "@semogtw/domain";
import { SqliteStageCompletionRepository } from "@semogtw/database";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { getNodeDatabase } from "./node-database.server";
import { requireMutationOwner } from "./require-mutation-owner.server";

const CompleteStageSchema = z.object({
  csrfToken: z.string().min(1),
  stageId: z.string().min(1).max(200),
  reason: z.string().max(2_000),
  confirmed: z.literal(true),
});

export const completeStageFn = createServerFn({ method: "POST" })
  .validator(CompleteStageSchema)
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
        message: "Não foi possível salvar esta alteração.",
      };
    }

    const service = new StageCompletionService(
      new SqliteStageCompletionRepository(database),
    );
    try {
      const result = await service.complete(
        {
          stageId: data.stageId,
          reason: data.reason,
          confirmed: data.confirmed,
        },
        {
          actorId: owner.id,
          auditId: crypto.randomUUID(),
          correlationId: crypto.randomUUID(),
          now: new Date().toISOString(),
        },
      );

      if (!result.ok) {
        const message =
          result.code === "VALIDATION_FAILED"
            ? "Informe um motivo válido e confirme a conclusão."
            : result.code === "INVARIANT_FAILED"
              ? "A etapa ainda não satisfaz os critérios de conclusão."
              : result.code === "NOT_FOUND"
                ? "Esta etapa não existe mais."
                : result.code === "ALREADY_COMPLETED"
                  ? "Esta etapa já foi concluída."
                  : "A etapa mudou desde a última leitura. Atualize o projeto e tente novamente.";
        return {
          ok: false as const,
          code: result.code,
          message,
          errors:
            result.code === "VALIDATION_FAILED" ||
            result.code === "INVARIANT_FAILED"
              ? result.errors
              : [],
        };
      }

      return {
        ok: true as const,
        stageId: result.stage.id,
        message: "Etapa concluída e auditada.",
      };
    } catch {
      return {
        ok: false as const,
        code: "WRITE_REJECTED" as const,
        message: "Não foi possível concluir esta etapa.",
      };
    }
  });
