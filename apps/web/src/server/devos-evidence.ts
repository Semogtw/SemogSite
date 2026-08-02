import { EvidenceService } from "@semogtw/domain";
import { SqliteEvidenceWriteRepository } from "@semogtw/database";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { getNodeDatabase } from "./node-database.server";
import { requireMutationOwner } from "./require-mutation-owner.server";

const ManualEvidenceSchema = z.object({
  csrfToken: z.string().min(1),
  projectId: z.string().min(1).max(200),
  stageId: z.string().max(200).nullable(),
  kind: z.enum([
    "commit",
    "pull_request",
    "issue",
    "workflow_run",
    "test",
    "document",
    "manual_note",
  ]),
  title: z.string().max(1_000),
  url: z.string().max(4_096).nullable(),
  externalId: z.string().max(1_000).nullable(),
  status: z.enum(["observed", "passed", "failed", "pending", "superseded"]),
  summary: z.string().max(10_000),
  reason: z.string().max(2_000),
  confirmed: z.literal(true),
});

export const attachManualEvidenceFn = createServerFn({ method: "POST" })
  .validator(ManualEvidenceSchema)
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

    const now = new Date().toISOString();
    const service = new EvidenceService(
      new SqliteEvidenceWriteRepository(database),
    );

    try {
      const result = await service.attachManualEvidence(
        {
          projectId: data.projectId,
          stageId: data.stageId,
          kind: data.kind,
          title: data.title,
          url: data.url,
          externalId: data.externalId,
          status: data.status,
          summary: data.summary,
          occurredAt: now,
          reason: data.reason,
          confirmed: data.confirmed,
        },
        {
          actorId: owner.id,
          evidenceId: crypto.randomUUID(),
          auditId: crypto.randomUUID(),
          correlationId: crypto.randomUUID(),
          now,
        },
      );

      if (!result.ok) {
        return {
          ok: false as const,
          code: "VALIDATION_FAILED" as const,
          message: "Revise a evidência antes de salvar.",
          errors: result.errors,
        };
      }

      return {
        ok: true as const,
        evidenceId: result.evidence.id,
        message: "Evidência registrada e auditada.",
      };
    } catch {
      return {
        ok: false as const,
        code: "WRITE_REJECTED" as const,
        message:
          "A evidência não pôde ser gravada. Atualize o projeto e verifique se o vínculo ainda existe.",
      };
    }
  });
