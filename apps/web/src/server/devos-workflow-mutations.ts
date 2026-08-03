import {
  SqliteScopeReservationRepository,
  SqliteVerificationObligationRepository,
} from "@semogtw/database";
import {
  ScopeReservationService,
  VerificationObligationService,
} from "@semogtw/domain/orchestration";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { getNodeDatabase } from "./node-database.server";
import { requireMutationOwner } from "./require-mutation-owner.server";

const AcquireScopeReservationSchema = z.object({
  csrfToken: z.string().min(1).max(500),
  idempotencyKey: z.string().uuid(),
  projectId: z.string().trim().min(1).max(200).nullable(),
  repositoryId: z.string().trim().min(1).max(200),
  runId: z.string().trim().min(1).max(200).nullable(),
  branch: z.string().trim().min(1).max(255),
  kind: z.enum(["repository", "directory", "files", "issue", "stage", "custom"]),
  patterns: z.array(z.string().trim().min(1).max(500)).min(1).max(100),
  holderLabel: z.string().trim().min(1).max(100),
  purpose: z.string().trim().min(1).max(1_000),
  ttlSeconds: z.number().int().min(300).max(86_400),
  acknowledgeOverlap: z.boolean(),
  confirmed: z.literal(true),
});

const ReleaseScopeReservationSchema = z.object({
  csrfToken: z.string().min(1).max(500),
  idempotencyKey: z.string().uuid(),
  reservationId: z.string().trim().min(1).max(200),
  runId: z.string().trim().min(1).max(200),
  expectedVersion: z.number().int().min(1),
  reason: z.string().trim().min(1).max(500),
  confirmed: z.literal(true),
});

const CreateVerificationObligationSchema = z.object({
  csrfToken: z.string().min(1).max(500),
  idempotencyKey: z.string().uuid(),
  projectId: z.string().trim().min(1).max(200).nullable(),
  repositoryId: z.string().trim().min(1).max(200),
  runId: z.string().trim().min(1).max(200).nullable(),
  stageId: z.string().trim().min(1).max(200).nullable(),
  branch: z.string().trim().min(1).max(255),
  targetCommitSha: z.string().regex(/^[0-9a-fA-F]{40}$/u),
  gateName: z.string().trim().min(1).max(200),
  command: z.string().trim().min(1).max(2_000),
  requiredCapabilities: z
    .array(z.string().trim().min(1).max(100))
    .min(1)
    .max(100),
  responsibleActor: z.string().trim().min(1).max(100),
  nextAction: z.string().trim().min(1).max(1_000),
  toolchainManifest: z.string().trim().min(1).max(500).nullable(),
  confirmed: z.literal(true),
});

function storageFailure() {
  return {
    ok: false as const,
    code: "STORAGE_UNAVAILABLE" as const,
    message: "O armazenamento privado está indisponível.",
  };
}

function unauthorizedFailure() {
  return {
    ok: false as const,
    code: "MUTATION_NOT_AUTHORIZED" as const,
    message: "Não foi possível autorizar esta alteração.",
  };
}

export const acquireScopeReservationFn = createServerFn({ method: "POST" })
  .validator(AcquireScopeReservationSchema)
  .handler(async ({ data }) => {
    const owner = await requireMutationOwner(data.csrfToken);
    if (owner === null) return unauthorizedFailure();
    const database = await getNodeDatabase();
    if (database === null) return storageFailure();

    const stableKey = data.idempotencyKey;
    const service = new ScopeReservationService(
      new SqliteScopeReservationRepository(database),
    );

    try {
      const result = await service.acquire(
        {
          projectId: data.projectId,
          repositoryId: data.repositoryId,
          runId: data.runId,
          branch: data.branch,
          kind: data.kind,
          patterns: data.patterns,
          holderLabel: data.holderLabel,
          purpose: data.purpose,
          ttlSeconds: data.ttlSeconds,
          acknowledgeOverlap: data.acknowledgeOverlap,
        },
        {
          actorId: owner.id,
          reservationId: `scope-reservation-${stableKey}`,
          auditId: `audit-scope-reservation-${stableKey}`,
          idempotencyKey: `scope-reservation-acquire-${stableKey}`,
          correlationId: `correlation-scope-reservation-${stableKey}`,
          now: new Date().toISOString(),
        },
      );

      if (!result.ok) {
        return {
          ok: false as const,
          code: result.code,
          message:
            result.code === "OVERLAP_CONFLICT"
              ? "Outro trabalho ativo cobre parte deste escopo. Revise a sobreposição antes de confirmar."
              : "A reserva não pôde ser criada sem violar o contrato de coordenação.",
          ...(result.code === "VALIDATION_FAILED"
            ? { errors: result.errors }
            : result.code === "OVERLAP_CONFLICT"
              ? { overlaps: result.overlaps }
              : {}),
        };
      }

      return {
        ok: true as const,
        message: "Escopo reservado de forma cooperativa.",
        reservation: result.reservation,
        overlaps: result.overlaps,
      };
    } catch {
      return {
        ok: false as const,
        code: "SCOPE_RESERVATION_FAILED" as const,
        message: "A reserva falhou sem confirmar estado parcial.",
      };
    }
  });

export const releaseScopeReservationFn = createServerFn({ method: "POST" })
  .validator(ReleaseScopeReservationSchema)
  .handler(async ({ data }) => {
    const owner = await requireMutationOwner(data.csrfToken);
    if (owner === null) return unauthorizedFailure();
    const database = await getNodeDatabase();
    if (database === null) return storageFailure();

    const stableKey = data.idempotencyKey;
    const service = new ScopeReservationService(
      new SqliteScopeReservationRepository(database),
    );
    try {
      const result = await service.release(
        {
          reservationId: data.reservationId,
          runId: data.runId,
          expectedVersion: data.expectedVersion,
          reason: data.reason,
        },
        {
          actorId: owner.id,
          reservationId: data.reservationId,
          auditId: `audit-scope-release-${stableKey}`,
          idempotencyKey: `scope-reservation-release-${stableKey}`,
          correlationId: `correlation-scope-release-${stableKey}`,
          now: new Date().toISOString(),
        },
      );
      if (!result.ok) {
        return {
          ok: false as const,
          code: result.code,
          message: "A reserva mudou ou não pertence ao run informado.",
          ...(result.code === "VALIDATION_FAILED" ? { errors: result.errors } : {}),
        };
      }
      return {
        ok: true as const,
        message: "Reserva liberada; o histórico foi preservado.",
        reservation: result.reservation,
      };
    } catch {
      return {
        ok: false as const,
        code: "SCOPE_RELEASE_FAILED" as const,
        message: "A liberação falhou sem confirmar estado parcial.",
      };
    }
  });

export const createVerificationObligationFn = createServerFn({ method: "POST" })
  .validator(CreateVerificationObligationSchema)
  .handler(async ({ data }) => {
    const owner = await requireMutationOwner(data.csrfToken);
    if (owner === null) return unauthorizedFailure();
    const database = await getNodeDatabase();
    if (database === null) return storageFailure();

    const stableKey = data.idempotencyKey;
    const service = new VerificationObligationService(
      new SqliteVerificationObligationRepository(database),
    );
    try {
      const result = await service.create(
        {
          projectId: data.projectId,
          repositoryId: data.repositoryId,
          runId: data.runId,
          stageId: data.stageId,
          branch: data.branch,
          targetCommitSha: data.targetCommitSha,
          gateName: data.gateName,
          command: data.command,
          requiredCapabilities: data.requiredCapabilities,
          responsibleActor: data.responsibleActor,
          nextAction: data.nextAction,
          toolchainManifest: data.toolchainManifest,
        },
        {
          actorId: owner.id,
          obligationId: `verification-obligation-${stableKey}`,
          auditId: `audit-verification-obligation-${stableKey}`,
          idempotencyKey: `verification-obligation-create-${stableKey}`,
          correlationId: `correlation-verification-obligation-${stableKey}`,
          now: new Date().toISOString(),
        },
      );
      if (!result.ok) {
        return {
          ok: false as const,
          code: result.code,
          message: "O gate não pôde ser registrado para este snapshot de código.",
          ...(result.code === "VALIDATION_FAILED" ? { errors: result.errors } : {}),
        };
      }
      return {
        ok: true as const,
        message: "Gate pendente registrado para o commit exato.",
        obligation: result.obligation,
      };
    } catch {
      return {
        ok: false as const,
        code: "VERIFICATION_OBLIGATION_FAILED" as const,
        message: "O gate falhou sem confirmar estado parcial.",
      };
    }
  });
