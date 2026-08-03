import {
  SqliteRecoverySnapshotRepository,
  SqliteRecoverySnapshotSource,
} from "@semogtw/database";
import { RecoverySnapshotService } from "@semogtw/domain/orchestration";
import { createServerFn } from "@tanstack/react-start";
import { createHash } from "node:crypto";
import { z } from "zod";
import { getNodeDatabase } from "./node-database.server";
import { requireMutationOwner } from "./require-mutation-owner.server";

const CreateRecoverySnapshotSchema = z.object({
  csrfToken: z.string().min(1).max(500),
  idempotencyKey: z.string().uuid(),
  repositoryId: z.string().trim().min(1).max(200),
  nextAction: z.string().trim().min(1).max(1_000),
  continuationPrompt: z.string().trim().min(1).max(8_000),
  runtimeLabel: z.string().trim().min(1).max(200),
  runtimeCapabilities: z
    .array(z.string().trim().min(1).max(100))
    .min(1)
    .max(100),
  toolchainManifest: z.string().trim().min(1).max(500).nullable(),
  planPath: z.string().trim().min(1).max(500).nullable(),
  planSection: z.string().trim().min(1).max(200).nullable(),
  confirmed: z.literal(true),
});

function hashCanonicalJson(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export const createRecoverySnapshotFn = createServerFn({ method: "POST" })
  .validator(CreateRecoverySnapshotSchema)
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
    const snapshotId = `recovery-snapshot-${stableKey}`;
    const generatedAt = new Date().toISOString();
    const source = new SqliteRecoverySnapshotSource(database);

    try {
      const sourceResult = await source.build({
        snapshotId,
        repositoryId: data.repositoryId,
        generatedAt,
        nextAction: data.nextAction,
        continuationPrompt: data.continuationPrompt,
        runtimeLabel: data.runtimeLabel,
        runtimeCapabilities: data.runtimeCapabilities,
        toolchainManifest: data.toolchainManifest,
        planPath: data.planPath,
        planSection: data.planSection,
      });
      if (!sourceResult.ok) {
        const message =
          sourceResult.code === "BRANCH_OBSERVATION_NOT_FOUND"
            ? "A branch aceita ainda não possui um SHA observado. Sincronize o GitHub antes de gerar o snapshot."
            : sourceResult.code === "PROJECT_NOT_FOUND"
              ? "O repositório precisa estar associado a um projeto antes de gerar o snapshot."
              : sourceResult.code === "REPOSITORY_NOT_FOUND"
                ? "O repositório não está disponível como alvo ativo."
                : "O horário de geração não pôde ser validado.";
        return {
          ok: false as const,
          code: sourceResult.code,
          message,
        };
      }

      const service = new RecoverySnapshotService(
        new SqliteRecoverySnapshotRepository(database),
        hashCanonicalJson,
      );
      const result = await service.create(sourceResult.input, {
        actorId: owner.id,
        auditId: `audit-recovery-snapshot-${stableKey}`,
        idempotencyKey: `recovery-snapshot-create-${stableKey}`,
        correlationId: `correlation-recovery-snapshot-${stableKey}`,
        source: "manual",
      });
      if (!result.ok) {
        return {
          ok: false as const,
          code: result.code,
          message:
            result.code === "DUPLICATE"
              ? "Este snapshot já foi preservado."
              : result.code === "SNAPSHOT_INVALID"
                ? "Os dados persistidos não produziram um snapshot seguro."
                : "O snapshot não pôde ser salvo sem violar o histórico imutável.",
          ...(result.code === "SNAPSHOT_INVALID"
            ? { errors: result.errors }
            : {}),
        };
      }

      return {
        ok: true as const,
        message: "Snapshot de recuperação preservado com hash canônico.",
        snapshotId: result.record.id,
        canonicalHash: result.record.canonicalHash,
        markdown: result.record.markdown,
        sourceObservedAt: result.record.snapshot.sourceObservedAt,
        confidence: result.record.snapshot.confidence,
      };
    } catch {
      return {
        ok: false as const,
        code: "RECOVERY_SNAPSHOT_FAILED" as const,
        message: "A geração falhou sem confirmar estado parcial.",
      };
    }
  });
