import { SqliteScopeReservationRepository } from "@semogtw/database";
import { ScopeReservationService } from "@semogtw/domain/orchestration";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { getNodeDatabase } from "./node-database.server";
import { requireMutationOwner } from "./require-mutation-owner.server";

const OverrideScopeReservationSchema = z.object({
  csrfToken: z.string().min(1).max(500),
  idempotencyKey: z.string().uuid(),
  reservationId: z.string().trim().min(1).max(200),
  expectedVersion: z.number().int().min(1),
  reason: z.string().trim().min(1).max(500),
  confirmed: z.literal(true),
});

export const overrideScopeReservationFn = createServerFn({ method: "POST" })
  .validator(OverrideScopeReservationSchema)
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
    const service = new ScopeReservationService(
      new SqliteScopeReservationRepository(database),
    );
    try {
      const result = await service.override(
        {
          reservationId: data.reservationId,
          expectedVersion: data.expectedVersion,
          reason: data.reason,
          confirmed: true,
        },
        {
          actorId: owner.id,
          reservationId: data.reservationId,
          auditId: `audit-scope-override-${stableKey}`,
          idempotencyKey: `scope-reservation-override-${stableKey}`,
          correlationId: `correlation-scope-override-${stableKey}`,
          now: new Date().toISOString(),
        },
      );
      if (!result.ok) {
        return {
          ok: false as const,
          code: result.code,
          message:
            result.code === "STALE_STATE"
              ? "A reserva mudou desde a leitura. Atualize a página antes de encerrar."
              : "A reserva não pôde ser encerrada sem violar o histórico.",
          ...(result.code === "VALIDATION_FAILED"
            ? { errors: result.errors }
            : {}),
        };
      }
      return {
        ok: true as const,
        message: "Reserva encerrada pelo proprietário; o histórico foi preservado.",
        reservation: result.reservation,
      };
    } catch {
      return {
        ok: false as const,
        code: "SCOPE_OVERRIDE_FAILED" as const,
        message: "O encerramento falhou sem confirmar estado parcial.",
      };
    }
  });
