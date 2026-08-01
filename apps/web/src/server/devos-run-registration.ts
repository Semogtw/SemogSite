import { SqliteCooperativeRunRegistrationRepository } from "@semogtw/database";
import { CooperativeRunRegistrationService } from "@semogtw/domain";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { getNodeDatabase } from "./node-database.server";
import { requireMutationOwner } from "./require-mutation-owner.server";

const RegisterCooperativeRunSchema = z.object({
  csrfToken: z.string().min(1).max(500),
  idempotencyKey: z.string().uuid(),
  projectId: z.string().trim().min(1).max(200).nullable(),
  title: z.string().trim().min(1).max(200),
  actorLabel: z.string().trim().min(1).max(100),
  origin: z.enum(["chatgpt", "codex", "manual", "automation", "other"]),
  phase: z.string().trim().min(1).max(200).nullable(),
  branch: z.string().trim().min(1).max(255).nullable(),
  initialSummary: z.string().trim().min(1).max(2_000),
  nextAction: z.string().trim().min(1).max(1_000),
  staleAfterSeconds: z.number().int().min(300).max(86_400),
  confirmed: z.literal(true),
});

const failureMessages = {
  DUPLICATE: "Esta execução já foi registrada.",
  PROJECT_NOT_FOUND: "O projeto selecionado não existe ou foi arquivado.",
  CONFLICT: "O estado mudou durante o registro. Nenhum run parcial foi criado.",
} as const;

export const registerCooperativeRunFn = createServerFn({ method: "POST" })
  .validator(RegisterCooperativeRunSchema)
  .handler(async ({ data }) => {
    const owner = await requireMutationOwner(data.csrfToken);
    if (owner === null) {
      return {
        ok: false as const,
        code: "MUTATION_NOT_AUTHORIZED" as const,
        message: "Não foi possível autorizar este registro.",
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
    const service = new CooperativeRunRegistrationService(
      new SqliteCooperativeRunRegistrationRepository(database),
    );

    try {
      const result = await service.register(
        {
          projectId: data.projectId,
          title: data.title,
          actorLabel: data.actorLabel,
          origin: data.origin,
          phase: data.phase,
          branch: data.branch,
          initialSummary: data.initialSummary,
          nextAction: data.nextAction,
          staleAfterSeconds: data.staleAfterSeconds,
        },
        {
          actorId: owner.id,
          runId: `cooperative-run-${stableKey}`,
          eventId: `run-event-registration-${stableKey}`,
          idempotencyKey: `run-registration-${stableKey}`,
          correlationId: `correlation-run-registration-${stableKey}`,
          now: new Date().toISOString(),
        },
      );

      if (!result.ok) {
        if (result.code === "VALIDATION_FAILED") {
          return {
            ok: false as const,
            code: result.code,
            message: "Revise os campos e o limite de freshness.",
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
        message:
          "Execução registrada como relato cooperativo; nenhum processo foi iniciado pelo DevOS.",
        run: {
          id: result.run.id,
          title: result.run.title,
          status: result.run.status,
          updatedAt: result.run.updatedAt,
        },
      };
    } catch {
      return {
        ok: false as const,
        code: "RUN_REGISTRATION_FAILED" as const,
        message:
          "A execução não pôde ser registrada. Nenhum estado parcial foi confirmado.",
      };
    }
  });
