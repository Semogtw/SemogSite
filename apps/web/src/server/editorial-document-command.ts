import {
  SqliteEditorialWriteRepository,
  type SqliteDatabase,
} from "@semogtw/database";
import {
  EditorialWriteService,
  type EditorialDocumentKind,
  type EditorialWriteResult,
} from "@semogtw/domain";
import {
  computeEditorialContentHash,
  normalizeEditorialTags,
} from "./editorial-content.server";

export type CreateEditorialDocumentCommandInput = {
  ownerId: string;
  idempotencyKey: string;
  kind: EditorialDocumentKind;
  slug: string;
  title: string;
  excerpt: string;
  bodyMarkdown: string;
  tags: readonly string[];
  now: string;
};

export async function createEditorialDocumentCommand(
  database: SqliteDatabase,
  input: CreateEditorialDocumentCommandInput,
): Promise<EditorialWriteResult> {
  const stableKey = input.idempotencyKey.trim();
  const tags = normalizeEditorialTags(input.tags);
  const service = new EditorialWriteService(
    new SqliteEditorialWriteRepository(database),
  );

  return service.createDocument(
    {
      documentId: `editorial-document-${stableKey}`,
      revisionId: `editorial-revision-${stableKey}`,
      kind: input.kind,
      slug: input.slug,
      title: input.title,
      excerpt: input.excerpt,
      bodyMarkdown: input.bodyMarkdown,
      tags,
      contentHash: computeEditorialContentHash({
        title: input.title,
        excerpt: input.excerpt,
        bodyMarkdown: input.bodyMarkdown,
        tags,
      }),
    },
    {
      actorId: input.ownerId,
      eventId: `editorial-event-create-${stableKey}`,
      idempotencyKey: `editorial-create-${stableKey}`,
      correlationId: `correlation-editorial-create-${stableKey}`,
      now: input.now,
    },
  );
}
