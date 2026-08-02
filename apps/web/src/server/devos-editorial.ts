import {
  SqliteEditorialReadModel,
  type SqliteDatabase,
} from "@semogtw/database";
import { redirect } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { approveEditorialRevisionCommand } from "./editorial-approve-command";
import { createEditorialDocumentCommand } from "./editorial-document-command";
import { createEditorialRevisionCommand } from "./editorial-revision-command";
import { reopenEditorialDraftCommand } from "./editorial-reopen-draft-command";
import { submitEditorialForReviewCommand } from "./editorial-submit-review-command";
import { parseEditorialTags } from "./editorial-content.server";
import { resolveCurrentOwner } from "./current-owner.server";
import { getNodeDatabase } from "./node-database.server";
import { requireMutationOwner } from "./require-mutation-owner.server";

const EditorialListQuerySchema = z.object({
  limit: z.number().int().min(1).max(100),
});

const EditorialDetailQuerySchema = z.object({
  documentId: z.string().trim().min(1).max(200),
});

const CreateEditorialRevisionSchema = z.object({
  csrfToken: z.string().min(1).max(500),
  idempotencyKey: z.string().uuid(),
  documentId: z.string().trim().min(1).max(200),
  expectedUpdatedAt: z.string().datetime(),
  title: z.string().trim().min(1).max(160),
  excerpt: z.string().trim().min(1).max(320),
  bodyMarkdown: z.string().trim().min(1).max(100_000),
  tags: z.string().max(1_000),
  confirmed: z.literal(true),
});

const SubmitEditorialForReviewSchema = z.object({
  csrfToken: z.string().min(1).max(500),
  idempotencyKey: z.string().uuid(),
  documentId: z.string().trim().min(1).max(200),
  expectedUpdatedAt: z.string().datetime(),
  confirmed: z.literal(true),
});

const ApproveEditorialRevisionSchema = z.object({
  csrfToken: z.string().min(1).max(500),
  idempotencyKey: z.string().uuid(),
  documentId: z.string().trim().min(1).max(200),
  revisionId: z.string().trim().min(1).max(200),
  expectedUpdatedAt: z.string().datetime(),
  reason: z.string().trim().min(1).max(2_000),
  notes: z.string().max(4_000),
  checks: z.object({
    credentials: z.literal(true),
    personalData: z.literal(true),
    operationalMetadata: z.literal(true),
    externalLinks: z.literal(true),
    legalAttribution: z.literal(true),
    factualClaims: z.literal(true),
    markdownSafety: z.literal(true),
  }),
  confirmed: z.literal(true),
});

const ReopenEditorialDraftSchema = z.object({
  csrfToken: z.string().min(1).max(500),
  idempotencyKey: z.string().uuid(),
  documentId: z.string().trim().min(1).max(200),
  expectedUpdatedAt: z.string().datetime(),
  reason: z.string().trim().min(1).max(2_000),
  confirmed: z.literal(true),
});

const CreateEditorialDocumentSchema = z.object({
  csrfToken: z.string().min(1).max(500),
  idempotencyKey: z.string().uuid(),
  kind: z.enum(["project", "note", "experiment", "page"]),
  slug: z
    .string()
    .trim()
    .min(1)
    .max(120)
    .regex(/^[a-z0-9](?:[a-z0-9-]{0,118}[a-z0-9])?$/u),
  title: z.string().trim().min(1).max(160),
  excerpt: z.string().trim().min(1).max(320),
  bodyMarkdown: z.string().trim().min(1).max(100_000),
  tags: z.string().max(1_000),
  confirmed: z.literal(true),
});

async function requireEditorialDatabase(): Promise<SqliteDatabase> {
  const owner = await resolveCurrentOwner();
  if (owner === null) throw redirect({ to: "/devos/login" });

  const database = await getNodeDatabase();
  if (database === null) throw new Error("EDITORIAL_STORAGE_UNAVAILABLE");
  return database;
}

export const getEditorialDocumentsFn = createServerFn({ method: "GET" })
  .validator(EditorialListQuerySchema)
  .handler(async ({ data }) => {
    const database = await requireEditorialDatabase();
    return new SqliteEditorialReadModel(database).listDocuments({
      limit: data.limit,
    });
  });

export const getEditorialDocumentDetailFn = createServerFn({ method: "GET" })
  .validator(EditorialDetailQuerySchema)
  .handler(async ({ data }) => {
    const database = await requireEditorialDatabase();
    return new SqliteEditorialReadModel(database).getDocument(data.documentId);
  });

export const createEditorialDocumentFn = createServerFn({ method: "POST" })
  .validator(CreateEditorialDocumentSchema)
  .handler(async ({ data }) => {
    const owner = await requireMutationOwner(data.csrfToken);
    if (owner === null) {
      return {
        ok: false as const,
        code: "MUTATION_NOT_AUTHORIZED" as const,
        message: "Não foi possível autorizar a criação do rascunho.",
      };
    }

    const database = await getNodeDatabase();
    if (database === null) {
      return {
        ok: false as const,
        code: "STORAGE_UNAVAILABLE" as const,
        message: "O armazenamento editorial privado está indisponível.",
      };
    }

    try {
      const result = await createEditorialDocumentCommand(database, {
        ownerId: owner.id,
        idempotencyKey: data.idempotencyKey,
        kind: data.kind,
        slug: data.slug,
        title: data.title,
        excerpt: data.excerpt,
        bodyMarkdown: data.bodyMarkdown,
        tags: parseEditorialTags(data.tags),
        now: new Date().toISOString(),
      });

      if (!result.ok) {
        if (result.code === "VALIDATION_FAILED") {
          return {
            ok: false as const,
            code: result.code,
            errors: result.errors,
            message:
              "Revise o conteúdo. HTML bruto, campos excessivos e tags inválidas são recusados.",
          };
        }
        const message =
          result.code === "SLUG_CONFLICT"
            ? "Este slug já pertence a outro documento editorial."
            : "O rascunho não foi criado porque o estado mudou ou entrou em conflito.";
        return { ok: false as const, code: result.code, message };
      }

      return {
        ok: true as const,
        duplicate: result.duplicate,
        message: result.duplicate
          ? "O mesmo rascunho já havia sido criado; nenhum conteúdo foi duplicado."
          : "Rascunho privado criado. Ele ainda não possui aprovação nem projeção pública.",
        document: {
          id: result.document.id,
          slug: result.document.slug,
          workflowStatus: result.document.workflowStatus,
          publicationStatus: result.document.publicationStatus,
          updatedAt: result.document.updatedAt,
        },
      };
    } catch {
      return {
        ok: false as const,
        code: "EDITORIAL_CREATE_FAILED" as const,
        message:
          "O rascunho não pôde ser criado. Nenhum estado parcial foi confirmado.",
      };
    }
  });

export const createEditorialRevisionFn = createServerFn({ method: "POST" })
  .validator(CreateEditorialRevisionSchema)
  .handler(async ({ data }) => {
    const owner = await requireMutationOwner(data.csrfToken);
    if (owner === null) {
      return {
        ok: false as const,
        code: "MUTATION_NOT_AUTHORIZED" as const,
        message: "Não foi possível autorizar a criação da revisão.",
      };
    }

    const database = await getNodeDatabase();
    if (database === null) {
      return {
        ok: false as const,
        code: "STORAGE_UNAVAILABLE" as const,
        message: "O armazenamento editorial privado está indisponível.",
      };
    }

    try {
      const result = await createEditorialRevisionCommand(database, {
        documentId: data.documentId,
        ownerId: owner.id,
        idempotencyKey: data.idempotencyKey,
        expectedUpdatedAt: data.expectedUpdatedAt,
        title: data.title,
        excerpt: data.excerpt,
        bodyMarkdown: data.bodyMarkdown,
        tags: parseEditorialTags(data.tags),
        now: new Date().toISOString(),
      });

      if (!result.ok) {
        if (result.code === "VALIDATION_FAILED") {
          return {
            ok: false as const,
            code: result.code,
            errors: result.errors,
            message:
              "Revise o conteúdo. HTML bruto e campos editoriais inválidos são recusados.",
          };
        }
        const message =
          result.code === "STALE_STATE"
            ? "O documento mudou desde que esta tela foi carregada. Recarregue antes de criar outra revisão."
            : result.code === "DOCUMENT_NOT_FOUND"
              ? "O documento editorial não foi encontrado."
              : "A revisão não foi criada porque a identidade ou o estado entrou em conflito.";
        return { ok: false as const, code: result.code, message };
      }

      return {
        ok: true as const,
        duplicate: result.duplicate,
        message: result.duplicate
          ? "Esta revisão já havia sido salva; nenhum histórico foi duplicado."
          : "Nova revisão privada criada. Aprovação e publicação continuam inalteradas.",
        document: {
          id: result.document.id,
          workingRevisionId: result.document.workingRevisionId,
          workflowStatus: result.document.workflowStatus,
          publicationStatus: result.document.publicationStatus,
          version: result.document.version,
          updatedAt: result.document.updatedAt,
        },
        revision: result.revision
          ? {
              id: result.revision.id,
              sequence: result.revision.sequence,
              contentHash: result.revision.contentHash,
            }
          : null,
      };
    } catch {
      return {
        ok: false as const,
        code: "EDITORIAL_REVISION_FAILED" as const,
        message:
          "A revisão não pôde ser criada. Nenhum estado parcial foi confirmado.",
      };
    }
  });

export const submitEditorialForReviewFn = createServerFn({ method: "POST" })
  .validator(SubmitEditorialForReviewSchema)
  .handler(async ({ data }) => {
    const owner = await requireMutationOwner(data.csrfToken);
    if (owner === null) {
      return {
        ok: false as const,
        code: "MUTATION_NOT_AUTHORIZED" as const,
        message: "Não foi possível autorizar o envio para revisão.",
      };
    }

    const database = await getNodeDatabase();
    if (database === null) {
      return {
        ok: false as const,
        code: "STORAGE_UNAVAILABLE" as const,
        message: "O armazenamento editorial privado está indisponível.",
      };
    }

    try {
      const result = await submitEditorialForReviewCommand(database, {
        documentId: data.documentId,
        ownerId: owner.id,
        idempotencyKey: data.idempotencyKey,
        expectedUpdatedAt: data.expectedUpdatedAt,
        now: new Date().toISOString(),
      });

      if (!result.ok) {
        const message =
          result.code === "STALE_STATE"
            ? "O documento mudou desde que esta tela foi carregada. Recarregue antes de enviar para revisão."
            : result.code === "INVALID_TRANSITION" ||
                result.code === "INVALID_CURRENT_STATE"
              ? "Somente um rascunho íntegro pode ser enviado para revisão."
              : result.code === "DOCUMENT_NOT_FOUND" ||
                  result.code === "REVISION_NOT_FOUND"
                ? "O documento ou sua revisão de trabalho não foi encontrado."
                : "O envio para revisão entrou em conflito com outra tentativa.";
        return { ok: false as const, code: result.code, message };
      }

      return {
        ok: true as const,
        duplicate: result.duplicate,
        message: result.duplicate
          ? "Este mesmo envio já havia sido confirmado; nenhum evento foi duplicado."
          : "Revisão de trabalho enviada para análise sensível. O conteúdo continua privado.",
        document: {
          id: result.document.id,
          workflowStatus: result.document.workflowStatus,
          publicationStatus: result.document.publicationStatus,
          version: result.document.version,
          updatedAt: result.document.updatedAt,
        },
      };
    } catch {
      return {
        ok: false as const,
        code: "EDITORIAL_SUBMIT_REVIEW_FAILED" as const,
        message:
          "O envio para revisão falhou. A identidade da tentativa pode ser reutilizada com segurança.",
      };
    }
  });


export const approveEditorialRevisionFn = createServerFn({ method: "POST" })
  .validator(ApproveEditorialRevisionSchema)
  .handler(async ({ data }) => {
    const owner = await requireMutationOwner(data.csrfToken);
    if (owner === null) {
      return {
        ok: false as const,
        code: "MUTATION_NOT_AUTHORIZED" as const,
        message: "Não foi possível autorizar a aprovação editorial.",
      };
    }

    const database = await getNodeDatabase();
    if (database === null) {
      return {
        ok: false as const,
        code: "STORAGE_UNAVAILABLE" as const,
        message: "O armazenamento editorial privado está indisponível.",
      };
    }

    try {
      const result = await approveEditorialRevisionCommand(database, {
        documentId: data.documentId,
        revisionId: data.revisionId,
        ownerId: owner.id,
        idempotencyKey: data.idempotencyKey,
        expectedUpdatedAt: data.expectedUpdatedAt,
        reason: data.reason,
        notes: data.notes.trim().length === 0 ? null : data.notes,
        checks: data.checks,
        now: new Date().toISOString(),
      });

      if (!result.ok) {
        if (result.code === "VALIDATION_FAILED") {
          return {
            ok: false as const,
            code: result.code,
            errors: result.errors,
            message:
              result.errors.includes("REVIEW_CHECKS_INCOMPLETE")
                ? "Todos os itens do checklist sensível precisam ser confirmados."
                : "Revise o motivo, as notas e o checklist antes de aprovar.",
          };
        }
        const message =
          result.code === "STALE_STATE"
            ? "O documento mudou desde que esta análise começou. Recarregue antes de aprovar."
            : result.code === "INVALID_TRANSITION" ||
                result.code === "INVALID_CURRENT_STATE"
              ? "Somente uma revisão em análise pode ser aprovada."
              : result.code === "DOCUMENT_NOT_FOUND" ||
                  result.code === "REVISION_NOT_FOUND"
                ? "O documento ou a revisão analisada não foi encontrado."
                : "A aprovação entrou em conflito com outra tentativa ou identidade.";
        return { ok: false as const, code: result.code, message };
      }

      return {
        ok: true as const,
        duplicate: result.duplicate,
        message: result.duplicate
          ? "Esta aprovação já havia sido registrada; revisão e evento não foram duplicados."
          : "Revisão aprovada e vinculada ao hash analisado. Nada foi publicado.",
        document: {
          id: result.document.id,
          workflowStatus: result.document.workflowStatus,
          publicationStatus: result.document.publicationStatus,
          approvedRevisionId: result.document.approvedRevisionId,
          version: result.document.version,
          updatedAt: result.document.updatedAt,
        },
        approval: result.approval
          ? {
              id: result.approval.id,
              revisionId: result.approval.revisionId,
              contentHash: result.approval.contentHash,
              reviewedAt: result.approval.reviewedAt,
            }
          : null,
      };
    } catch {
      return {
        ok: false as const,
        code: "EDITORIAL_APPROVAL_FAILED" as const,
        message:
          "A aprovação falhou. A identidade da tentativa pode ser reutilizada com segurança.",
      };
    }
  });


export const reopenEditorialDraftFn = createServerFn({ method: "POST" })
  .validator(ReopenEditorialDraftSchema)
  .handler(async ({ data }) => {
    const owner = await requireMutationOwner(data.csrfToken);
    if (owner === null) {
      return {
        ok: false as const,
        code: "MUTATION_NOT_AUTHORIZED" as const,
        message: "Não foi possível autorizar a reabertura do rascunho.",
      };
    }

    const database = await getNodeDatabase();
    if (database === null) {
      return {
        ok: false as const,
        code: "STORAGE_UNAVAILABLE" as const,
        message: "O armazenamento editorial privado está indisponível.",
      };
    }

    try {
      const result = await reopenEditorialDraftCommand(database, {
        documentId: data.documentId,
        ownerId: owner.id,
        idempotencyKey: data.idempotencyKey,
        expectedUpdatedAt: data.expectedUpdatedAt,
        reason: data.reason,
        now: new Date().toISOString(),
      });

      if (!result.ok) {
        if (result.code === "VALIDATION_FAILED") {
          return {
            ok: false as const,
            code: result.code,
            errors: result.errors,
            message: "Informe um motivo auditável para reabrir esta revisão.",
          };
        }
        const message =
          result.code === "STALE_STATE"
            ? "O documento mudou desde que esta tela foi carregada. Recarregue antes de reabrir."
            : result.code === "INVALID_TRANSITION" ||
                result.code === "INVALID_CURRENT_STATE"
              ? "Somente conteúdo em análise ou aprovado pode ser reaberto."
              : result.code === "DOCUMENT_NOT_FOUND" ||
                  result.code === "REVISION_NOT_FOUND"
                ? "O documento ou a revisão de trabalho não foi encontrado."
                : "A reabertura entrou em conflito com outra tentativa ou identidade.";
        return { ok: false as const, code: result.code, message };
      }

      return {
        ok: true as const,
        duplicate: result.duplicate,
        message: result.duplicate
          ? "Esta reabertura já havia sido registrada; nenhum evento foi duplicado."
          : "Revisão reaberta como rascunho. Aprovação anterior deixou de ser a revisão ativa.",
        document: {
          id: result.document.id,
          workflowStatus: result.document.workflowStatus,
          publicationStatus: result.document.publicationStatus,
          approvedRevisionId: result.document.approvedRevisionId,
          version: result.document.version,
          updatedAt: result.document.updatedAt,
        },
      };
    } catch {
      return {
        ok: false as const,
        code: "EDITORIAL_REOPEN_FAILED" as const,
        message:
          "A reabertura falhou. A identidade da tentativa pode ser reutilizada com segurança.",
      };
    }
  });
