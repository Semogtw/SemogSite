import type {
  ChangeRepositorySyncTargetInput,
  RepositorySyncTargetLifecycleContext,
  RepositoryTargetLifecycleResult,
} from "@semogtw/domain";
import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { z } from "zod";
import type { ApiEnvironment } from "../../middleware/request-context";

const MAX_REPOSITORY_TARGET_BODY_BYTES = 8 * 1024;
const ChangeRepositoryTargetSchema = z.object({
  repositoryId: z.string().max(200),
  desiredSyncEnabled: z.boolean(),
  expectedSyncEnabled: z.boolean(),
  expectedUpdatedAt: z.string().max(100),
  reason: z.string().max(2_000),
  confirmed: z.boolean(),
});

export interface PrivateRepositoryTargetCommands {
  change(
    input: ChangeRepositorySyncTargetInput,
    context: RepositorySyncTargetLifecycleContext,
  ): Promise<RepositoryTargetLifecycleResult>;
}

function isJsonRequest(contentType: string | undefined): boolean {
  if (contentType === undefined) return false;
  const mediaType = contentType.split(";", 1)[0]?.trim().toLowerCase();
  return mediaType === "application/json" || mediaType?.endsWith("+json") === true;
}

const limitRepositoryTargetBody = bodyLimit({
  maxSize: MAX_REPOSITORY_TARGET_BODY_BYTES,
  onError: (context) => {
    context.header("cache-control", "no-store, private");
    return context.json(
      {
        ok: false,
        error: {
          code: "PAYLOAD_TOO_LARGE",
          message: "Não foi possível atualizar este alvo.",
          correlationId: context.get("correlationId"),
        },
      },
      413,
    );
  },
});

export function createPrivateRepositoryTargetRoutes(
  commands?: PrivateRepositoryTargetCommands,
) {
  return new Hono<ApiEnvironment>({ strict: false }).post(
    "/lifecycle",
    limitRepositoryTargetBody,
    async (context) => {
      context.header("cache-control", "no-store, private");
      if (!isJsonRequest(context.req.header("content-type"))) {
        return context.json(
          {
            ok: false,
            error: {
              code: "INVALID_REQUEST",
              message: "Não foi possível atualizar este alvo.",
              correlationId: context.get("correlationId"),
            },
          },
          400,
        );
      }

      const parsed = ChangeRepositoryTargetSchema.safeParse(
        await context.req.json().catch(() => null),
      );
      if (!parsed.success) {
        return context.json(
          {
            ok: false,
            error: {
              code: "INVALID_REQUEST",
              message: "Não foi possível atualizar este alvo.",
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
              message: "Não foi possível salvar esta alteração.",
              correlationId: context.get("correlationId"),
            },
          },
          503,
        );
      }

      let result: RepositoryTargetLifecycleResult;
      try {
        result = await commands.change(parsed.data, {
          actorId: owner.id,
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
              message: "Não foi possível salvar esta alteração.",
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
                message: "Revise o motivo, a confirmação e o estado observado.",
                details: result.errors,
                correlationId: context.get("correlationId"),
              },
            },
            400,
          );
        }
        if (result.code === "REPOSITORY_NOT_FOUND") {
          return context.json(
            {
              ok: false,
              error: {
                code: result.code,
                message: "O repositório não existe mais.",
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
                result.code === "ALREADY_APPLIED"
                  ? "O alvo já está no estado solicitado."
                  : result.code === "STALE_STATE"
                    ? "O estado observado está desatualizado."
                    : "O estado mudou durante a decisão. Atualize e tente novamente.",
              correlationId: context.get("correlationId"),
            },
          },
          409,
        );
      }

      return context.json({
        ok: true,
        data: {
          repositoryId: result.target.id,
          syncEnabled: result.target.syncEnabled,
          updatedAt: result.target.updatedAt,
        },
      });
    },
  );
}
