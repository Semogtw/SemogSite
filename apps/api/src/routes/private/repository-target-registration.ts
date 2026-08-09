import type {
  RegisterRepositorySyncTargetInput,
  RepositorySyncTargetRegistrationContext,
  RepositoryTargetRegistrationResult,
} from "@semogtw/domain";
import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { z } from "zod";
import type { ApiEnvironment } from "../../middleware/request-context";

const MAX_REPOSITORY_TARGET_REGISTRATION_BODY_BYTES = 8 * 1024;
const RegisterRepositoryTargetSchema = z.object({
  projectId: z.string().max(200),
  fullName: z.string().max(140),
  defaultBranch: z.string().max(255),
  role: z.enum([
    "product",
    "core",
    "integration",
    "infrastructure",
    "academic",
    "experiment",
  ]),
  reason: z.string().max(2_000),
  confirmed: z.boolean(),
});

export interface PrivateRepositoryTargetRegistrationCommands {
  register(
    input: RegisterRepositorySyncTargetInput,
    context: RepositorySyncTargetRegistrationContext,
  ): Promise<RepositoryTargetRegistrationResult>;
}

function isJsonRequest(contentType: string | undefined): boolean {
  if (contentType === undefined) return false;
  const mediaType = contentType.split(";", 1)[0]?.trim().toLowerCase();
  return mediaType === "application/json" || mediaType?.endsWith("+json") === true;
}

const limitBody = bodyLimit({
  maxSize: MAX_REPOSITORY_TARGET_REGISTRATION_BODY_BYTES,
  onError: (context) => {
    context.header("cache-control", "no-store, private");
    return context.json(
      {
        ok: false,
        error: {
          code: "PAYLOAD_TOO_LARGE",
          message: "Não foi possível cadastrar este alvo.",
          correlationId: context.get("correlationId"),
        },
      },
      413,
    );
  },
});

export function createPrivateRepositoryTargetRegistrationRoutes(
  commands?: PrivateRepositoryTargetRegistrationCommands,
) {
  return new Hono<ApiEnvironment>({ strict: false }).post(
    "/register",
    limitBody,
    async (context) => {
      context.header("cache-control", "no-store, private");
      if (!isJsonRequest(context.req.header("content-type"))) {
        return context.json(
          {
            ok: false,
            error: {
              code: "INVALID_REQUEST",
              message: "Não foi possível cadastrar este alvo.",
              correlationId: context.get("correlationId"),
            },
          },
          400,
        );
      }

      const parsed = RegisterRepositoryTargetSchema.safeParse(
        await context.req.json().catch(() => null),
      );
      if (!parsed.success) {
        return context.json(
          {
            ok: false,
            error: {
              code: "INVALID_REQUEST",
              message: "Não foi possível cadastrar este alvo.",
              correlationId: context.get("correlationId"),
            },
          },
          400,
        );
      }

      const owner = context.get("owner");
      if (owner === null) {
        return context.json(
          {
            ok: false,
            error: {
              code: "UNAUTHORIZED",
              message: "Acesso não autorizado.",
              correlationId: context.get("correlationId"),
            },
          },
          401,
        );
      }
      if (commands === undefined) {
        return context.json(
          {
            ok: false,
            error: {
              code: "MUTATION_UNAVAILABLE",
              message: "Não foi possível salvar este alvo.",
              correlationId: context.get("correlationId"),
            },
          },
          503,
        );
      }

      let result: RepositoryTargetRegistrationResult;
      try {
        result = await commands.register(parsed.data, {
          actorId: owner.id,
          repositoryId: `repository-${crypto.randomUUID()}`,
          auditId: crypto.randomUUID(),
          correlationId: context.get("correlationId"),
          now: new Date().toISOString(),
        });
      } catch {
        return context.json(
          {
            ok: false,
            error: {
              code: "STORAGE_UNAVAILABLE",
              message: "Não foi possível salvar este alvo.",
              correlationId: context.get("correlationId"),
            },
          },
          503,
        );
      }

      if (!result.ok) {
        if (result.code === "VALIDATION_FAILED") {
          return context.json(
            {
              ok: false,
              error: {
                code: result.code,
                message: "Revise os campos, o motivo e a confirmação.",
                details: result.errors,
                correlationId: context.get("correlationId"),
              },
            },
            400,
          );
        }
        if (result.code === "PROJECT_NOT_FOUND") {
          return context.json(
            {
              ok: false,
              error: {
                code: result.code,
                message: "O projeto selecionado não existe mais.",
                correlationId: context.get("correlationId"),
              },
            },
            404,
          );
        }
        return context.json(
          {
            ok: false,
            error: {
              code: result.code,
              message:
                result.code === "DUPLICATE_REPOSITORY"
                  ? "Este repositório já está cadastrado."
                  : "O estado mudou durante o cadastro. Tente novamente.",
              correlationId: context.get("correlationId"),
            },
          },
          409,
        );
      }

      return context.json(
        {
          ok: true,
          data: {
            repositoryId: result.target.id,
            fullName: result.target.fullName,
            projectId: result.target.projectId,
            role: result.target.role,
          },
        },
        201,
      );
    },
  );
}
