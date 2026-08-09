import type {
  VerificationObligationResult,
  VerificationObligationService,
} from "@semogtw/domain/orchestration";
import { Hono, type Context } from "hono";
import { bodyLimit } from "hono/body-limit";
import { z } from "zod";
import type { ApiEnvironment } from "../../middleware/request-context";

const MAX_VERIFICATION_BODY_BYTES = 32 * 1024;
const idempotencyKey = z.string().uuid();
const obligationId = z.string().trim().min(1).max(200);
const expectedVersion = z.number().int().min(1);
const confirmed = z.literal(true);
const failureClassification = z.enum([
  "code_failure",
  "environment_missing",
  "flaky",
  "timeout",
  "quota",
  "configuration",
  "external_dependency",
  "unknown",
]);

const CreateSchema = z.object({
  idempotencyKey,
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
  confirmed,
});

const ResultSchema = z.object({
  idempotencyKey,
  obligationId,
  expectedVersion,
  outcome: z.enum(["passed", "failed", "blocked"]),
  failureClassification: failureClassification.nullable(),
  resultSummary: z.string().trim().min(1).max(2_000),
  evidenceUrls: z.array(z.string().url().max(2_000)).max(20),
  nextAction: z.string().trim().min(1).max(1_000),
  confirmed,
});

const SupersedeSchema = z.object({
  idempotencyKey,
  obligationId,
  expectedVersion,
  reason: z.string().trim().min(1).max(2_000),
  confirmed,
});

const WaiveSchema = z.object({
  idempotencyKey,
  obligationId,
  expectedVersion,
  reason: z.string().trim().min(1).max(2_000),
  confirmed,
});

export type PrivateVerificationObligationCommands = Pick<
  VerificationObligationService,
  "create" | "recordResult" | "supersede" | "waive"
>;

type FailureResult = Extract<VerificationObligationResult, { ok: false }>;
type PrivateContext = Context<ApiEnvironment>;

function isJsonRequest(contentType: string | undefined): boolean {
  if (contentType === undefined) return false;
  const mediaType = contentType.split(";", 1)[0]?.trim().toLowerCase();
  return mediaType === "application/json" || mediaType?.endsWith("+json") === true;
}

function failureStatus(code: FailureResult["code"]): 400 | 404 | 409 {
  if (code === "VALIDATION_FAILED") return 400;
  if (
    code === "NOT_FOUND" ||
    code === "PROJECT_NOT_FOUND" ||
    code === "REPOSITORY_NOT_FOUND" ||
    code === "RUN_NOT_FOUND" ||
    code === "STAGE_NOT_FOUND"
  ) {
    return 404;
  }
  return 409;
}

function failureMessage(code: FailureResult["code"]): string {
  if (code === "VALIDATION_FAILED") {
    return "A alteração não satisfaz o contrato do gate.";
  }
  if (code === "NOT_FOUND") return "O gate não existe mais.";
  if (code === "PROJECT_NOT_FOUND") return "O projeto referenciado não existe.";
  if (code === "REPOSITORY_NOT_FOUND") {
    return "O repositório referenciado não existe.";
  }
  if (code === "RUN_NOT_FOUND") return "A execução referenciada não existe.";
  if (code === "STAGE_NOT_FOUND") return "A etapa referenciada não existe.";
  if (code === "STALE_STATE") {
    return "O gate mudou desde a última leitura. Atualize antes de tentar novamente.";
  }
  if (code === "TERMINAL_OBLIGATION") return "O gate já está em estado terminal.";
  if (code === "DUPLICATE") return "Esta alteração já foi registrada.";
  return "O estado mudou durante a gravação. Nenhuma alteração parcial foi confirmada.";
}

function invalidRequest(context: PrivateContext) {
  return context.json(
    {
      ok: false,
      error: {
        code: "INVALID_REQUEST",
        message: "Não foi possível atualizar este gate.",
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
        message: "Não foi possível salvar esta alteração.",
        correlationId: context.get("correlationId"),
      },
    },
    503,
  );
}

function storageFailure(context: PrivateContext) {
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

function domainFailure(context: PrivateContext, result: FailureResult) {
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
  maxSize: MAX_VERIFICATION_BODY_BYTES,
  onError: (context) => {
    context.header("cache-control", "no-store, private");
    return context.json(
      {
        ok: false,
        error: {
          code: "PAYLOAD_TOO_LARGE",
          message: "Não foi possível atualizar este gate.",
          correlationId: context.get("correlationId"),
        },
      },
      413,
    );
  },
});

export function createPrivateVerificationObligationRoutes(
  commands?: PrivateVerificationObligationCommands,
) {
  const routes = new Hono<ApiEnvironment>({ strict: false });

  routes.post("/create", limitBody, async (context) => {
    context.header("cache-control", "no-store, private");
    if (!isJsonRequest(context.req.header("content-type"))) {
      return invalidRequest(context);
    }
    const parsed = CreateSchema.safeParse(await context.req.json().catch(() => null));
    if (!parsed.success) return invalidRequest(context);
    const owner = context.get("owner");
    if (owner === null) return unauthorized(context);
    if (commands === undefined) return unavailable(context);

    const stableKey = parsed.data.idempotencyKey;
    try {
      const result = await commands.create(
        {
          projectId: parsed.data.projectId,
          repositoryId: parsed.data.repositoryId,
          runId: parsed.data.runId,
          stageId: parsed.data.stageId,
          branch: parsed.data.branch,
          targetCommitSha: parsed.data.targetCommitSha,
          gateName: parsed.data.gateName,
          command: parsed.data.command,
          requiredCapabilities: parsed.data.requiredCapabilities,
          responsibleActor: parsed.data.responsibleActor,
          nextAction: parsed.data.nextAction,
          toolchainManifest: parsed.data.toolchainManifest,
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
      if (!result.ok) return domainFailure(context, result);
      return context.json(
        {
          ok: true,
          data: { obligation: result.obligation, gateExecuted: false },
        },
        201,
      );
    } catch {
      return storageFailure(context);
    }
  });

  routes.post("/result", limitBody, async (context) => {
    context.header("cache-control", "no-store, private");
    if (!isJsonRequest(context.req.header("content-type"))) return invalidRequest(context);
    const parsed = ResultSchema.safeParse(await context.req.json().catch(() => null));
    if (!parsed.success) return invalidRequest(context);
    const owner = context.get("owner");
    if (owner === null) return unauthorized(context);
    if (commands === undefined) return unavailable(context);

    const stableKey = parsed.data.idempotencyKey;
    try {
      const result = await commands.recordResult(
        {
          obligationId: parsed.data.obligationId,
          expectedVersion: parsed.data.expectedVersion,
          outcome: parsed.data.outcome,
          failureClassification: parsed.data.failureClassification,
          resultSummary: parsed.data.resultSummary,
          evidenceUrls: parsed.data.evidenceUrls,
          nextAction: parsed.data.nextAction,
        },
        {
          actorId: owner.id,
          obligationId: parsed.data.obligationId,
          auditId: `audit-verification-result-${stableKey}`,
          idempotencyKey: `verification-result-${stableKey}`,
          correlationId: `correlation-verification-result-${stableKey}`,
          now: new Date().toISOString(),
        },
      );
      if (!result.ok) return domainFailure(context, result);
      return context.json({
        ok: true,
        data: { obligation: result.obligation, gateExecuted: false },
      });
    } catch {
      return storageFailure(context);
    }
  });

  routes.post("/supersede", limitBody, async (context) => {
    context.header("cache-control", "no-store, private");
    if (!isJsonRequest(context.req.header("content-type"))) return invalidRequest(context);
    const parsed = SupersedeSchema.safeParse(await context.req.json().catch(() => null));
    if (!parsed.success) return invalidRequest(context);
    const owner = context.get("owner");
    if (owner === null) return unauthorized(context);
    if (commands === undefined) return unavailable(context);

    const stableKey = parsed.data.idempotencyKey;
    try {
      const result = await commands.supersede(
        {
          obligationId: parsed.data.obligationId,
          expectedVersion: parsed.data.expectedVersion,
          reason: parsed.data.reason,
        },
        {
          actorId: owner.id,
          obligationId: parsed.data.obligationId,
          auditId: `audit-verification-supersede-${stableKey}`,
          idempotencyKey: `verification-supersede-${stableKey}`,
          correlationId: `correlation-verification-supersede-${stableKey}`,
          now: new Date().toISOString(),
        },
      );
      if (!result.ok) return domainFailure(context, result);
      return context.json({ ok: true, data: { obligation: result.obligation } });
    } catch {
      return storageFailure(context);
    }
  });

  routes.post("/waive", limitBody, async (context) => {
    context.header("cache-control", "no-store, private");
    if (!isJsonRequest(context.req.header("content-type"))) return invalidRequest(context);
    const parsed = WaiveSchema.safeParse(await context.req.json().catch(() => null));
    if (!parsed.success) return invalidRequest(context);
    const owner = context.get("owner");
    if (owner === null) return unauthorized(context);
    if (commands === undefined) return unavailable(context);

    const stableKey = parsed.data.idempotencyKey;
    try {
      const result = await commands.waive(
        {
          obligationId: parsed.data.obligationId,
          expectedVersion: parsed.data.expectedVersion,
          reason: parsed.data.reason,
          confirmed: parsed.data.confirmed,
        },
        {
          actorId: owner.id,
          obligationId: parsed.data.obligationId,
          auditId: `audit-verification-waive-${stableKey}`,
          idempotencyKey: `verification-waive-${stableKey}`,
          correlationId: `correlation-verification-waive-${stableKey}`,
          now: new Date().toISOString(),
        },
      );
      if (!result.ok) return domainFailure(context, result);
      return context.json({ ok: true, data: { obligation: result.obligation } });
    } catch {
      return storageFailure(context);
    }
  });

  return routes;
}
