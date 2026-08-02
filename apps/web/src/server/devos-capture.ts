import { AttentionCaptureService } from "@semogtw/domain";
import { SqliteAttentionCaptureRepository } from "@semogtw/database";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { getNodeDatabase } from "./node-database.server";
import { requireMutationOwner } from "./require-mutation-owner.server";

const CaptureAttentionSchema = z.object({
  csrfToken: z.string().min(1),
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
  confirmed: z.literal(true),
});

export const captureAttentionFn = createServerFn({ method: "POST" })
  .validator(CaptureAttentionSchema)
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

    const service = new AttentionCaptureService(
      new SqliteAttentionCaptureRepository(database),
    );
    const result = await service.capture(
      {
        projectId: null,
        type: data.type,
        impact: data.impact,
        title: data.title,
        nextAction: data.nextAction,
        reason: data.reason,
        confirmed: data.confirmed,
      },
      {
        actorId: owner.id,
        attentionId: crypto.randomUUID(),
        auditId: crypto.randomUUID(),
        correlationId: crypto.randomUUID(),
        now: new Date().toISOString(),
      },
    );

    if (!result.ok) {
      return {
        ok: false as const,
        code: "VALIDATION_FAILED" as const,
        message: "Revise os campos antes de salvar.",
        errors: result.errors,
      };
    }

    return {
      ok: true as const,
      attentionId: result.attention.id,
      message: "Atenção registrada e auditada.",
    };
  });
