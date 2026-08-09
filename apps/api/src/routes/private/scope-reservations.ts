import type {
  ScopeReservationResult,
  ScopeReservationService,
} from "@semogtw/domain/orchestration";
import { Hono, type Context } from "hono";
import { bodyLimit } from "hono/body-limit";
import { z } from "zod";
import type { ApiEnvironment } from "../../middleware/request-context";

const MAX_SCOPE_RESERVATION_BODY_BYTES = 32 * 1024;
const retryKey = z.string().uuid();
const reservationId = z.string().trim().min(1).max(200);
const expectedVersion = z.number().int().min(1);
const confirmed = z.literal(true);

const AcquireSchema = z.object({
  idempotencyKey: retryKey,
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
  confirmed,
});

const RenewSchema = z.object({
  idempotencyKey: retryKey,
  reservationId,
  runId: z.string().trim().min(1).max(200),
  expectedVersion,
  ttlSeconds: z.number().int().min(300).max(86_400),
  confirmed,
});

const ReleaseSchema = z.object({
  idempotencyKey: retryKey,
  reservationId,
  runId: z.string().trim().min(1).max(200),
  expectedVersion,
  reason: z.string().trim().min(1).max(500),
  confirmed,
});

const OverrideSchema = z.object({
  idempotencyKey: retryKey,
  reservationId,
  expectedVersion,
  reason: z.string().trim().min(1).max(500),
  confirmed,
});

export type PrivateScopeReservationCommands = Pick<
  ScopeReservationService,
  "acquire" | "renew" | "release" | "override"
>;

type Failure = Extract<ScopeReservationResult, { ok: false }>;
type PrivateContext = Context<ApiEnvironment>;

function isJsonRequest(contentType: string | undefined): boolean {
  if (contentType === undefined) return false;
  const mediaType = contentType.split(";", 1)[0]?.trim().toLowerCase();
  return mediaType === "application/json" || mediaType?.endsWith("+json") === true;
}

function failureStatus(code: Failure["code"]): 400 | 404 | 409 {
  if (code === "VALIDATION_FAILED") return 400;
  if (code === "NOT_FOUND" || code === "REPOSITORY_NOT_FOUND" || code === "RUN_NOT_FOUND") {
    return 404;
  }
  return 409;
}

function failureMessage(code: Failure["code"]): string {
  if (code === "VALIDATION_FAILED") return "A reserva não satisfaz o contrato de coordenação.";
  if (code === "OVERLAP_CONFLICT") return "Outro trabalho ativo cobre parte deste escopo.";
  if (code === "NOT_FOUND") return "A reserva não existe mais.";
  if (code === "NOT_OWNER") return "A reserva pertence a outro run.";
  if (code === "STALE_STATE") return "A reserva mudou desde a última leitura.";
  if (code === "EXPIRED") return "A reserva expirou e não pode ser renovada.";
  if (code === "INACTIVE") return "A reserva não está mais ativa.";
  if (code === "DUPLICATE") return "Esta alteração já foi registrada.";
  if (code === "REPOSITORY_NOT_FOUND") return "O repositório não existe ou não está ativo.";
  if (code === "RUN_NOT_FOUND") return "O run informado não existe.";
  return "O estado mudou durante a gravação. Nenhuma alteração parcial foi confirmada.";
}

function invalidRequest(context: PrivateContext) {
  return context.json(
    { ok: false, error: { code: "INVALID_REQUEST", message: "Não foi possível atualizar esta reserva.", correlationId: context.get("correlationId") } },
    400,
  );
}

function unauthorized(context: PrivateContext) {
  return context.json(
    { ok: false, error: { code: "UNAUTHORIZED", message: "Acesso não autorizado.", correlationId: context.get("correlationId") } },
    401,
  );
}

function unavailable(context: PrivateContext) {
  return context.json(
    { ok: false, error: { code: "MUTATION_UNAVAILABLE", message: "Não foi possível salvar esta reserva.", correlationId: context.get("correlationId") } },
    503,
  );
}

function storageFailure(context: PrivateContext) {
  return context.json(
    { ok: false, error: { code: "STORAGE_UNAVAILABLE", message: "Não foi possível salvar esta reserva.", correlationId: context.get("correlationId") } },
    503,
  );
}

function domainFailure(context: PrivateContext, result: Failure) {
  const details = result.code === "VALIDATION_FAILED" ? result.errors : undefined;
  const overlaps = result.code === "OVERLAP_CONFLICT" ? result.overlaps : undefined;
  return context.json(
    {
      ok: false,
      error: {
        code: result.code,
        message: failureMessage(result.code),
        ...(details === undefined ? {} : { details }),
        ...(overlaps === undefined ? {} : { overlaps }),
        correlationId: context.get("correlationId"),
      },
    },
    failureStatus(result.code),
  );
}

const limitBody = bodyLimit({
  maxSize: MAX_SCOPE_RESERVATION_BODY_BYTES,
  onError: (context) => {
    context.header("cache-control", "no-store, private");
    return context.json(
      { ok: false, error: { code: "PAYLOAD_TOO_LARGE", message: "Não foi possível atualizar esta reserva.", correlationId: context.get("correlationId") } },
      413,
    );
  },
});

export function createPrivateScopeReservationRoutes(
  commands?: PrivateScopeReservationCommands,
) {
  const routes = new Hono<ApiEnvironment>({ strict: false });

  routes.post("/acquire", limitBody, async (context) => {
    context.header("cache-control", "no-store, private");
    if (!isJsonRequest(context.req.header("content-type"))) return invalidRequest(context);
    const parsed = AcquireSchema.safeParse(await context.req.json().catch(() => null));
    if (!parsed.success) return invalidRequest(context);
    const owner = context.get("owner");
    if (owner === null) return unauthorized(context);
    if (commands === undefined) return unavailable(context);

    const stableKey = parsed.data.idempotencyKey;
    try {
      const result = await commands.acquire(
        {
          projectId: parsed.data.projectId,
          repositoryId: parsed.data.repositoryId,
          runId: parsed.data.runId,
          branch: parsed.data.branch,
          kind: parsed.data.kind,
          patterns: parsed.data.patterns,
          holderLabel: parsed.data.holderLabel,
          purpose: parsed.data.purpose,
          ttlSeconds: parsed.data.ttlSeconds,
          acknowledgeOverlap: parsed.data.acknowledgeOverlap,
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
      if (!result.ok) return domainFailure(context, result);
      return context.json(
        { ok: true, data: { reservation: result.reservation, overlaps: result.overlaps } },
        201,
      );
    } catch {
      return storageFailure(context);
    }
  });

  routes.post("/renew", limitBody, async (context) => {
    context.header("cache-control", "no-store, private");
    if (!isJsonRequest(context.req.header("content-type"))) return invalidRequest(context);
    const parsed = RenewSchema.safeParse(await context.req.json().catch(() => null));
    if (!parsed.success) return invalidRequest(context);
    const owner = context.get("owner");
    if (owner === null) return unauthorized(context);
    if (commands === undefined) return unavailable(context);
    const stableKey = parsed.data.idempotencyKey;
    try {
      const result = await commands.renew(
        {
          reservationId: parsed.data.reservationId,
          runId: parsed.data.runId,
          expectedVersion: parsed.data.expectedVersion,
          ttlSeconds: parsed.data.ttlSeconds,
        },
        {
          actorId: owner.id,
          reservationId: parsed.data.reservationId,
          auditId: `audit-scope-renew-${stableKey}`,
          idempotencyKey: `scope-reservation-renew-${stableKey}`,
          correlationId: `correlation-scope-renew-${stableKey}`,
          now: new Date().toISOString(),
        },
      );
      if (!result.ok) return domainFailure(context, result);
      return context.json({ ok: true, data: { reservation: result.reservation } });
    } catch {
      return storageFailure(context);
    }
  });

  routes.post("/release", limitBody, async (context) => {
    context.header("cache-control", "no-store, private");
    if (!isJsonRequest(context.req.header("content-type"))) return invalidRequest(context);
    const parsed = ReleaseSchema.safeParse(await context.req.json().catch(() => null));
    if (!parsed.success) return invalidRequest(context);
    const owner = context.get("owner");
    if (owner === null) return unauthorized(context);
    if (commands === undefined) return unavailable(context);
    const stableKey = parsed.data.idempotencyKey;
    try {
      const result = await commands.release(
        {
          reservationId: parsed.data.reservationId,
          runId: parsed.data.runId,
          expectedVersion: parsed.data.expectedVersion,
          reason: parsed.data.reason,
        },
        {
          actorId: owner.id,
          reservationId: parsed.data.reservationId,
          auditId: `audit-scope-release-${stableKey}`,
          idempotencyKey: `scope-reservation-release-${stableKey}`,
          correlationId: `correlation-scope-release-${stableKey}`,
          now: new Date().toISOString(),
        },
      );
      if (!result.ok) return domainFailure(context, result);
      return context.json({ ok: true, data: { reservation: result.reservation } });
    } catch {
      return storageFailure(context);
    }
  });

  routes.post("/override", limitBody, async (context) => {
    context.header("cache-control", "no-store, private");
    if (!isJsonRequest(context.req.header("content-type"))) return invalidRequest(context);
    const parsed = OverrideSchema.safeParse(await context.req.json().catch(() => null));
    if (!parsed.success) return invalidRequest(context);
    const owner = context.get("owner");
    if (owner === null) return unauthorized(context);
    if (commands === undefined) return unavailable(context);
    const stableKey = parsed.data.idempotencyKey;
    try {
      const result = await commands.override(
        {
          reservationId: parsed.data.reservationId,
          expectedVersion: parsed.data.expectedVersion,
          reason: parsed.data.reason,
          confirmed: parsed.data.confirmed,
        },
        {
          actorId: owner.id,
          reservationId: parsed.data.reservationId,
          auditId: `audit-scope-override-${stableKey}`,
          idempotencyKey: `scope-reservation-override-${stableKey}`,
          correlationId: `correlation-scope-override-${stableKey}`,
          now: new Date().toISOString(),
        },
      );
      if (!result.ok) return domainFailure(context, result);
      return context.json({ ok: true, data: { reservation: result.reservation } });
    } catch {
      return storageFailure(context);
    }
  });

  return routes;
}
