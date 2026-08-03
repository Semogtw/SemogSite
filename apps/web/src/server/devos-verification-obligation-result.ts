import { SqliteVerificationObligationRepository } from "@semogtw/database";
import { VerificationObligationService } from "@semogtw/domain/orchestration";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { getNodeDatabase } from "./node-database.server";
import { requireMutationOwner } from "./require-mutation-owner.server";

const RecordVerificationResultSchema = z.object({
  csrfToken: z.string().min(1).max(500),
  idempotencyKey: z.string().uuid(),
  obligationId: z.string().trim().min(1).max(200),
  expectedVersion: z.number().int().min(1),
  outcome: z.enum(["passed", "failed", "blocked"]),
  failureClassification: z
    .enum([
      "code_failure",
      "environment_missing",
      "flaky",
      "timeout",
      "quota",
      "configuration",
      "external_dependency",
      "unknown",
    ])
    .nullable(),
  resultSummary: z.string().trim().min(1).max(2_000),
  evidenceUrls: z.array(z.string().url().max(2_000)).max(20),
  nextAction: z.string().trim().min(1).max(1_000),
  confirmed: z.literal(true),
});

export const recordVerificationResultFn = createServerFn({ method: "POST" })
  .validator(RecordVerificationResultSchema)
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

    const stableKey = data.idempotencyKey;
    const service = new VerificationObligationService(
      new SqliteVerificationObligationRepository(database),
    );
    try {
      const result = await service.recordResult(
        {
          obligationId: data.obligationId,
          expectedVersion: data.expectedVersion,
          outcome: data.outcome,
          failureClassification: data.failureClassification,
          resultSummary: data.resultSummary,
          evidenceUrls: data.evidenceUrls,
          nextAction: data.nextAction,
        },
        {
          actorId: owner.id,
          obligationId: data.obligationId,
          auditId: `audit-verification-result-${stableKey}`,
          idempotencyKey: `verification-result-${stableKey}`,
          correlationId: `correlation-verification-result-${stableKey}`,
          now: new Date().toISOString(),
        },
      );
      if (!result.ok) {
        return {
          ok: false as const,
          code: result.code,
          message:
            result.code === "STALE_STATE"
              ? "O gate mudou desde a leitura. Atualize a página antes de registrar o resultado."
              : "O resultado não pôde ser registrado sem violar o contrato do gate.",
          ...(result.code === "VALIDATION_FAILED"
            ? { errors: result.errors }
            : {}),
        };
      }
      return {
        ok: true as const,
        message:
          result.obligation.status === "passed"
            ? "Gate marcado como aprovado com evidência observada."
            : result.obligation.status === "blocked"
              ? "Gate marcado como bloqueado sem culpar o código automaticamente."
              : "Falha de gate registrada com classificação explícita.",
        obligation: result.obligation,
      };
    } catch {
      return {
        ok: false as const,
        code: "VERIFICATION_RESULT_FAILED" as const,
        message: "O resultado falhou sem confirmar estado parcial.",
      };
    }
  });
