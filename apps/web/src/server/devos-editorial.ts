import {
  SqliteEditorialReadModel,
  type SqliteDatabase,
} from "@semogtw/database";
import { redirect } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { createEditorialDocumentCommand } from "./editorial-document-command";
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
