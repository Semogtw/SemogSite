import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import {
  createEditorialRedirectCommand,
  revokeEditorialRedirectCommand,
} from "./editorial-redirect-command";
import { getNodeDatabase } from "./node-database.server";
import { requireMutationOwner } from "./require-mutation-owner.server";

const EditorialRedirectMutationSchema = z.object({
  csrfToken: z.string().min(1).max(500),
  idempotencyKey: z.string().uuid(),
  documentId: z.string().trim().min(1).max(200),
  kind: z.enum(["project", "note", "experiment", "page"]),
  sourceSlug: z
    .string()
    .trim()
    .min(1)
    .max(120)
    .regex(/^[a-z0-9](?:[a-z0-9-]{0,118}[a-z0-9])?$/u),
  reason: z.string().trim().min(1).max(2_000),
  confirmed: z.literal(true),
});

function redirectFailureMessage(code: string): string {
  if (code === "TARGET_NOT_PUBLISHED") {
    return "Aliases só podem apontar para um documento atualmente publicado.";
  }
  if (code === "SOURCE_CANONICAL_CONFLICT") {
    return "Este slug já é canônico para outro documento editorial.";
  }
  if (code === "SOURCE_MATCHES_TARGET") {
    return "O alias precisa ser diferente do slug canônico.";
  }
  if (code === "REDIRECT_ALREADY_ACTIVE") return "Este alias já está ativo.";
  if (code === "REDIRECT_NOT_ACTIVE") {
    return "Este alias não está ativo ou já foi revogado.";
  }
  if (code === "TARGET_NOT_FOUND" || code === "TARGET_KIND_MISMATCH") {
    return "O documento de destino não foi encontrado com este tipo editorial.";
  }
  if (code === "VALIDATION_FAILED") {
    return "Revise o slug, o motivo e a confirmação do alias.";
  }
  return "A alteração do alias entrou em conflito com outra tentativa ou identidade.";
}

export const createEditorialRedirectFn = createServerFn({ method: "POST" })
  .validator(EditorialRedirectMutationSchema)
  .handler(async ({ data }) => {
    const owner = await requireMutationOwner(data.csrfToken);
    if (owner === null) {
      return {
        ok: false as const,
        code: "MUTATION_NOT_AUTHORIZED" as const,
        message: "Não foi possível autorizar a criação do alias.",
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
      const result = await createEditorialRedirectCommand(database, {
        sourceSlug: data.sourceSlug,
        kind: data.kind,
        documentId: data.documentId,
        ownerId: owner.id,
        idempotencyKey: data.idempotencyKey,
        reason: data.reason,
        now: new Date().toISOString(),
      });
      if (!result.ok) {
        return {
          ok: false as const,
          code: result.code,
          message: redirectFailureMessage(result.code),
        };
      }
      return {
        ok: true as const,
        duplicate: result.duplicate,
        message: result.duplicate
          ? "Este alias já havia sido criado; nenhum evento foi duplicado."
          : "Alias auditado criado para a publicação canônica.",
        event: result.event,
      };
    } catch {
      return {
        ok: false as const,
        code: "EDITORIAL_REDIRECT_CREATE_FAILED" as const,
        message:
          "A criação do alias falhou. A identidade da tentativa pode ser reutilizada com segurança.",
      };
    }
  });

export const revokeEditorialRedirectFn = createServerFn({ method: "POST" })
  .validator(EditorialRedirectMutationSchema)
  .handler(async ({ data }) => {
    const owner = await requireMutationOwner(data.csrfToken);
    if (owner === null) {
      return {
        ok: false as const,
        code: "MUTATION_NOT_AUTHORIZED" as const,
        message: "Não foi possível autorizar a revogação do alias.",
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
      const result = await revokeEditorialRedirectCommand(database, {
        sourceSlug: data.sourceSlug,
        kind: data.kind,
        documentId: data.documentId,
        ownerId: owner.id,
        idempotencyKey: data.idempotencyKey,
        reason: data.reason,
        now: new Date().toISOString(),
      });
      if (!result.ok) {
        return {
          ok: false as const,
          code: result.code,
          message: redirectFailureMessage(result.code),
        };
      }
      return {
        ok: true as const,
        duplicate: result.duplicate,
        message: result.duplicate
          ? "Esta revogação já havia sido registrada; nenhum evento foi duplicado."
          : "Alias revogado. A URL antiga deixa de resolver no servidor.",
        event: result.event,
      };
    } catch {
      return {
        ok: false as const,
        code: "EDITORIAL_REDIRECT_REVOKE_FAILED" as const,
        message:
          "A revogação falhou. A identidade da tentativa pode ser reutilizada com segurança.",
      };
    }
  });
