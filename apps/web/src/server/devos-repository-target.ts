import { SqliteRepositoryTargetRegistrationRepository } from "@semogtw/database";
import { RepositoryTargetRegistrationService } from "@semogtw/domain";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { getNodeDatabase } from "./node-database.server";
import { requireMutationOwner } from "./require-mutation-owner.server";

const RegisterRepositoryTargetSchema = z.object({
  csrfToken: z.string().min(1),
  projectId: z.string().trim().min(1).max(200),
  fullName: z.string().trim().min(3).max(140),
  defaultBranch: z.string().trim().min(1).max(255),
  role: z.enum(["primary", "secondary"]),
  reason: z.string().trim().min(1).max(500),
  confirmed: z.literal(true),
});

const failureMessages = {
  PROJECT_NOT_FOUND: "O projeto selecionado não existe mais.",
  DUPLICATE_REPOSITORY:
    "Este repositório já está cadastrado como alvo de sincronização.",
  CONFLICT:
    "O estado mudou durante o cadastro. Nenhum alvo foi criado.",
} as const;

export const registerRepositoryTargetFn = createServerFn({ method: "POST" })
  .validator(RegisterRepositoryTargetSchema)
  .handler(async ({ data }) => {
    const owner = await requireMutationOwner(data.csrfToken);
    if (owner === null) {
      return {
        ok: false as const,
        code: "MUTATION_NOT_AUTHORIZED" as const,
        message: "Não foi possível autorizar este cadastro.",
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

    const repository = new SqliteRepositoryTargetRegistrationRepository(
      database,
    );
    const service = new RepositoryTargetRegistrationService(repository);
    const now = new Date().toISOString();

    try {
      const result = await service.register(
        {
          projectId: data.projectId,
          fullName: data.fullName,
          defaultBranch: data.defaultBranch,
          role: data.role,
          reason: data.reason,
          confirmed: data.confirmed,
        },
        {
          actorId: owner.id,
          repositoryId: `repository-${crypto.randomUUID()}`,
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
            message: "Revise os campos, o motivo e a confirmação.",
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
        message: `${result.target.fullName} foi cadastrado como alvo privado de sincronização.`,
        repository: {
          id: result.target.id,
          fullName: result.target.fullName,
          projectId: result.target.projectId,
          role: result.target.role,
        },
        auditId: result.audit.id,
      };
    } catch {
      return {
        ok: false as const,
        code: "REPOSITORY_TARGET_REGISTRATION_FAILED" as const,
        message:
          "O alvo não pôde ser cadastrado. Nenhum registro parcial foi preservado.",
      };
    }
  });
