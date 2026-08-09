import type {
  CooperativeRunRegistrationContext,
  CooperativeRunRegistrationResult,
  RegisterCooperativeRunInput,
} from "@semogtw/domain";
import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { z } from "zod";
import type { ApiEnvironment } from "../../middleware/request-context";

const MAX_RUN_REGISTRATION_BODY_BYTES = 16 * 1024;
const RegisterCooperativeRunSchema = z.object({
  idempotencyKey: z.string().uuid(),
  projectId: z.string().max(200).nullable(),
  title: z.string().max(200),
  actorLabel: z.string().max(100),
  origin: z.enum(["chatgpt", "codex", "manual", "automation", "other"]),
  phase: z.string().max(200).nullable(),
  branch: z.string().max(255).nullable(),
  initialSummary: z.string().max(2_000),
  nextAction: z.string().max(1_000),
  staleAfterSeconds: z.number().int().min(300).max(86_400),
  confirmed: z.literal(true),
});

export interface PrivateCooperativeRunCommands {
  register(
    input: RegisterCooperativeRunInput,
    context: CooperativeRunRegistrationContext,
  ): Promise<CooperativeRunRegistrationResult>;
}

function isJsonRequest(contentType: string | undefined): boolean {
  if (contentType === undefined) return false;
  const mediaType = contentType.split(";", 1)[0]?.trim().toLowerCase();
  return mediaType === "application/json" || mediaType?.endsWith("+json") === true;
}

const limitBody = bodyLimit({
  maxSize: MAX_RUN_REGISTRATION_BODY_BYTES,
  onError: (context) => {
    context.header("cache-control", "no-store, private");
    return context.json(
      {
        ok: false,
        error: {
          code: "PAYLOAD_TOO_LARGE",
          message: "Não foi possível registrar esta execução.",
          correlationId: context.get("correlationId"),
        },
      },
      413,
    );
  },
});

export function createPrivateCooperativeRunRoutes(
  commands?: PrivateCooperativeRunCommands,
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
              message: "Não foi possível registrar esta execução.",
              correlationId: context.get("correlationId"),
            },
          },
          400,
        );
      }

      const parsed = RegisterCooperativeRunSchema.safeParse(
        await context.req.json().catch(() => null),
      );
      if (!parsed.success) {
        return context.json(
          {
            ok: false,
            error: {
              code: "INVALID_REQUEST",
              message: "Não foi possível registrar esta execução.",
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
              message: "Não foi possível registrar esta execução.",
              correlationId: context.get("correlationId"),
            },
          },
          503,
        );
      }

      const stableKey = parsed.data.idempotencyKey;
      let result: CooperativeRunRegistrationResult;
      try {
        result = await commands.register(
          {
            projectId: parsed.data.projectId,
            title: parsed.data.title,
            actorLabel: parsed.data.actorLabel,
            origin: parsed.data.origin,
            phase: parsed.data.phase,
            branch: parsed.data.branch,
            initialSummary: parsed.data.initialSummary,
            nextAction: parsed.data.nextAction,
            staleAfterSeconds: parsed.data.staleAfterSeconds,
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
      } catch {
        return context.json(
          {
            ok: false,
            error: {
              code: "STORAGE_UNAVAILABLE",
              message: "Não foi possível registrar esta execução.",
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
                message: "Revise os campos e o limite de freshness.",
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
                message: "O projeto selecionado não existe ou foi arquivado.",
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
                result.code === "DUPLICATE"
                  ? "Esta execução já foi registrada."
                  : "O estado mudou durante o registro.",
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
            runId: result.run.id,
            title: result.run.title,
            status: result.run.status,
            updatedAt: result.run.updatedAt,
            processStarted: false,
          },
        },
        201,
      );
    },
  );
}
