import type {
  EditorialRedirectResult,
  EditorialRedirectService,
} from "@semogtw/domain";
import { Hono, type Context } from "hono";
import { bodyLimit } from "hono/body-limit";
import { z } from "zod";
import type { ApiEnvironment } from "../../middleware/request-context";

const MAX_EDITORIAL_REDIRECT_BODY_BYTES = 16 * 1024;
const RedirectSchema = z.object({
  idempotencyKey: z.string().uuid(),
  sourceSlug: z.string().trim().min(1).max(120),
  kind: z.enum(["project", "note", "experiment", "page"]),
  targetDocumentId: z.string().trim().min(1).max(300),
  reason: z.string().trim().min(1).max(2_000),
  confirmed: z.literal(true),
});

export type PrivateEditorialRedirectCommands = Pick<
  EditorialRedirectService,
  "create" | "revoke"
>;

type Failure = Extract<EditorialRedirectResult, { ok: false }>;
type PrivateContext = Context<ApiEnvironment>;

function isJsonRequest(contentType: string | undefined): boolean {
  if (contentType === undefined) return false;
  const mediaType = contentType.split(";", 1)[0]?.trim().toLowerCase();
  return mediaType === "application/json" || mediaType?.endsWith("+json") === true;
}

function invalidRequest(context: PrivateContext) {
  return context.json(
    {
      ok: false,
      error: {
        code: "INVALID_REQUEST",
        message: "Não foi possível atualizar este redirect.",
        correlationId: context.get("correlationId"),
      },
    },
    400,
  );
}

function unauthorized(context: PrivateContext) {
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

function unavailable(context: PrivateContext) {
  return context.json(
    {
      ok: false,
      error: {
        code: "MUTATION_UNAVAILABLE",
        message: "Não foi possível salvar este redirect.",
        correlationId: context.get("correlationId"),
      },
    },
    503,
  );
}

function failureStatus(code: Failure["code"]): 400 | 404 | 409 {
  if (code === "VALIDATION_FAILED") return 400;
  if (code === "TARGET_NOT_FOUND") return 404;
  return 409;
}

function failureMessage(code: Failure["code"]): string {
  if (code === "VALIDATION_FAILED") return "Revise o slug, alvo, motivo e confirmação.";
  if (code === "TARGET_NOT_FOUND") return "O documento de destino não existe.";
  if (code === "TARGET_NOT_PUBLISHED") return "O documento de destino ainda não está publicado.";
  if (code === "TARGET_KIND_MISMATCH") return "O tipo do destino não corresponde ao redirect.";
  if (code === "SOURCE_CANONICAL_CONFLICT") return "O slug de origem já pertence a um documento canônico.";
  if (code === "SOURCE_MATCHES_TARGET") return "O slug de origem é o próprio slug canônico do destino.";
  if (code === "REDIRECT_ALREADY_ACTIVE") return "Já existe um redirect ativo para este slug.";
  if (code === "REDIRECT_NOT_ACTIVE") return "Não existe redirect ativo compatível para revogar.";
  return "O estado editorial mudou durante a gravação. Atualize e tente novamente.";
}

function domainFailure(context: PrivateContext, result: Failure) {
  const details = result.code === "VALIDATION_FAILED" ? result.errors : undefined;
  return context.json(
    {
      ok: false,
      error: {
        code: result.code,
        message: failureMessage(result.code),
        ...(details === undefined ? {} : { details }),
        correlationId: context.get("correlationId"),
      },
    },
    failureStatus(result.code),
  );
}

const limitBody = bodyLimit({
  maxSize: MAX_EDITORIAL_REDIRECT_BODY_BYTES,
  onError: (context) => {
    context.header("cache-control", "no-store, private");
    return context.json(
      {
        ok: false,
        error: {
          code: "PAYLOAD_TOO_LARGE",
          message: "Não foi possível atualizar este redirect.",
          correlationId: context.get("correlationId"),
        },
      },
      413,
    );
  },
});

export function createPrivateEditorialRedirectRoutes(
  commands?: PrivateEditorialRedirectCommands,
) {
  const routes = new Hono<ApiEnvironment>({ strict: false });

  async function execute(
    context: PrivateContext,
    action: "create" | "revoke",
  ) {
    context.header("cache-control", "no-store, private");
    if (!isJsonRequest(context.req.header("content-type"))) {
      return invalidRequest(context);
    }
    const parsed = RedirectSchema.safeParse(await context.req.json().catch(() => null));
    if (!parsed.success) return invalidRequest(context);
    const owner = context.get("owner");
    if (owner === null) return unauthorized(context);
    if (commands === undefined) return unavailable(context);

    const stableKey = parsed.data.idempotencyKey;
    const method = action === "create" ? commands.create.bind(commands) : commands.revoke.bind(commands);
    try {
      const result = await method(
        {
          sourceSlug: parsed.data.sourceSlug,
          kind: parsed.data.kind,
          targetDocumentId: parsed.data.targetDocumentId,
          reason: parsed.data.reason,
          confirmed: parsed.data.confirmed,
        },
        {
          actorId: owner.id,
          eventId: `editorial-redirect-${action}-${stableKey}`,
          idempotencyKey: `editorial-redirect-${action}-${stableKey}`,
          correlationId: `correlation-editorial-redirect-${action}-${stableKey}`,
          now: new Date().toISOString(),
        },
      );
      if (!result.ok) return domainFailure(context, result);
      return context.json({
        ok: true,
        data: {
          event: result.event,
          duplicate: result.duplicate,
        },
      });
    } catch {
      return context.json(
        {
          ok: false,
          error: {
            code: "STORAGE_UNAVAILABLE",
            message: "Não foi possível salvar este redirect.",
            correlationId: context.get("correlationId"),
          },
        },
        503,
      );
    }
  }

  routes.post("/create", limitBody, (context) => execute(context, "create"));
  routes.post("/revoke", limitBody, (context) => execute(context, "revoke"));
  return routes;
}
