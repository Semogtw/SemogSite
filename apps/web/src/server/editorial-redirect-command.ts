import {
  SqliteEditorialRedirectRepository,
  type SqliteDatabase,
} from "@semogtw/database";
import {
  EditorialRedirectService,
  type EditorialDocumentKind,
  type EditorialRedirectResult,
} from "@semogtw/domain";

export type EditorialRedirectCommandInput = {
  sourceSlug: string;
  kind: EditorialDocumentKind;
  documentId: string;
  ownerId: string;
  idempotencyKey: string;
  reason: string;
  now: string;
};

function context(input: EditorialRedirectCommandInput, action: "create" | "revoke") {
  const stableKey = input.idempotencyKey.trim();
  return {
    actorId: input.ownerId,
    eventId: `editorial-redirect-${action}-${stableKey}`,
    idempotencyKey: `editorial-redirect-${action}-${stableKey}`,
    correlationId: `correlation-editorial-redirect-${action}-${stableKey}`,
    now: input.now,
  };
}

export async function createEditorialRedirectCommand(
  database: SqliteDatabase,
  input: EditorialRedirectCommandInput,
): Promise<EditorialRedirectResult> {
  return new EditorialRedirectService(
    new SqliteEditorialRedirectRepository(database),
  ).create(
    {
      sourceSlug: input.sourceSlug,
      kind: input.kind,
      targetDocumentId: input.documentId,
      reason: input.reason,
      confirmed: true,
    },
    context(input, "create"),
  );
}

export async function revokeEditorialRedirectCommand(
  database: SqliteDatabase,
  input: EditorialRedirectCommandInput,
): Promise<EditorialRedirectResult> {
  return new EditorialRedirectService(
    new SqliteEditorialRedirectRepository(database),
  ).revoke(
    {
      sourceSlug: input.sourceSlug,
      kind: input.kind,
      targetDocumentId: input.documentId,
      reason: input.reason,
      confirmed: true,
    },
    context(input, "revoke"),
  );
}
