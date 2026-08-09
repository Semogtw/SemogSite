import type {
  AttachManualEvidenceInput,
  AttachManualEvidenceResult,
  EvidenceContext,
} from "@semogtw/domain";
import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { z } from "zod";
import type { ApiEnvironment } from "../../middleware/request-context";

const MAX_EVIDENCE_BODY_BYTES = 16 * 1024;

const ManualEvidenceSchema = z.object({
  projectId: z.string().min(1).max(200),
  stageId: z.string().max(200).nullable(),
  kind: z.enum([
    "commit",
    "pull_request",
    "issue",
    "workflow_run",
    "test",
    "document",
    "manual_note",
  ]),
  title: z.string().max(1_000),
  url: z.string().max(4_096).nullable(),
  externalId: z.string().max(1_000).nullable(),
  status: z.enum(["observed", "passed", "failed", "pending", "superseded"]),
  summary: z.string().max(10_000),
  reason: z.string().max(2_000),
  confirmed: z.boolean(),
});

export interface PrivateEvidenceCommands {
  attachManualEvidence(
    input: AttachManualEvidenceInput,
    context: EvidenceContext,
  ): Promise<AttachManualEvidenceResult>;
}

function isJsonRequest(contentType: string | undefined): boolean {
  if (contentType === undefined) return false;
  const mediaType = contentType.split(";", 1)[0]?.trim().toLowerCase();
  return mediaType === "application/json" || mediaType?.endsWith("+json") === true;
}

const limitEvidenceBody = bodyLimit({
  maxSize: MAX_EVIDENCE_BODY_BYTES,
  onError: (context) => {
    context.header("cache-control", "no-store, private");
    return context.json(
      {
        ok: false,
        error: {
          code: "PAYLOAD_TOO_LARGE",
          message: "Não foi possível registrar esta evidência.",
          correlationId: context.get("correlationId"),
        },
      },
      413,
    );
  },
});

export function createPrivateEvidenceRoutes(
  commands?: PrivateEvidenceCommands,
) {
  return new Hono<ApiEnvironment>({ strict: false }).post(
    "/",
    limitEvidenceBody,
    async (context) => {
      context.header("cache-control", "no-store, private");

      if (!isJsonRequest(context.req.header("content-type"))) {
        return context.json(
          {
            ok: false,
            error: {
              code: "INVALID_REQUEST",
              message: "Não foi possível registrar esta evidência.",
              correlationId: context.get("correlationId"),
            },
          },
          400,
        );
      }

      const parsed = ManualEvidenceSchema.safeParse(
        await context.req.json().catch(() => null),
      );
      if (!parsed.success) {
        return context.json(
          {
            ok: false,
            error: {
              code: "INVALID_REQUEST",
              message: "Não foi possível registrar esta evidência.",
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

      const now = new Date().toISOString();
      let result: AttachManualEvidenceResult;
      try {
        result = await commands.attachManualEvidence(
          {
            projectId: parsed.data.projectId,
            stageId: parsed.data.stageId,
            kind: parsed.data.kind,
            title: parsed.data.title,
            url: parsed.data.url,
            externalId: parsed.data.externalId,
            status: parsed.data.status,
            summary: parsed.data.summary,
            occurredAt: now,
            reason: parsed.data.reason,
            confirmed: parsed.data.confirmed,
          },
          {
            actorId: owner.id,
            evidenceId: crypto.randomUUID(),
            auditId: crypto.randomUUID(),
            correlationId: context.get("correlationId"),
            now,
          },
        );
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
        return context.json(
          {
            ok: false,
            error: {
              code: "VALIDATION_FAILED",
              message: "Revise a evidência antes de salvar.",
              details: result.errors,
              correlationId: context.get("correlationId"),
            },
          },
          400,
        );
      }

      return context.json(
        {
          ok: true,
          data: { evidenceId: result.evidence.id },
        },
        201,
      );
    },
  );
}
