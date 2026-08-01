import { AttentionLifecycleService } from "@semogtw/domain";
import { SqliteAttentionLifecycleRepository } from "@semogtw/database";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { getNodeDatabase } from "./node-database.server";
import { requireMutationOwner } from "./require-mutation-owner.server";

const AttentionLifecycleSchema = z.object({
  csrfToken: z.string().min(1),
  attentionId: z.string().min(1).max(200),
  targetStatus: z.enum(["resolved", "dismissed"]),
  reason: z.string().max(500),
  confirmed: z.literal(true),
});

export const transitionAttentionFn = createServerFn({ method: "POST" })
  .validator(AttentionLifecycleSchema)
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

    const service = new AttentionLifecycleService(
      new SqliteAttentionLifecycleRepository(database),
    );
    const result = await service.transition(
      {
        attentionId: data.attentionId,
        targetStatus: data.targetStatus,
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
          ? "Informe um motivo válido e confirme a alteração."
          : result.code === "NOT_FOUND"
            ? "Este item não existe mais."
            : result.code === "ALREADY_FINAL"
              ? "Este item já foi finalizado."
              : "O item mudou desde a última leitura. Atualize a página e tente novamente.";
      return {
        ok: false as const,
        code: result.code,
        message,
        errors: result.code === "VALIDATION_FAILED" ? result.errors : [],
      };
    }

    return {
      ok: true as const,
      attentionId: result.attention.id,
      status: result.attention.status,
      message:
        result.attention.status === "resolved"
          ? "Item resolvido e auditado."
          : "Item dispensado e auditado.",
    };
  });
