import {
  SqliteEditorialWriteRepository,
  type SqliteDatabase,
} from "@semogtw/database";
import {
  EditorialWriteService,
  type EditorialWriteResult,
} from "@semogtw/domain";
import {
  computeEditorialContentHash,
  normalizeEditorialTags,
} from "./editorial-content.server";

export type CreateEditorialRevisionCommandInput = {
  documentId: string;
  ownerId: string;
  idempotencyKey: string;
  expectedUpdatedAt: string;
  title: string;
  excerpt: string;
  bodyMarkdown: string;
  tags: readonly string[];
  now: string;
};

export async function createEditorialRevisionCommand(
  database: SqliteDatabase,
  input: CreateEditorialRevisionCommandInput,
): Promise<EditorialWriteResult> {
  const stableKey = input.idempotencyKey.trim();
  const tags = normalizeEditorialTags(input.tags);
  const service = new EditorialWriteService(
    new SqliteEditorialWriteRepository(database),
  );

  return service.createRevision(
    {
      documentId: input.documentId,
      revisionId: `editorial-revision-${stableKey}`,
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
      eventId: `editorial-event-revision-${stableKey}`,
      idempotencyKey: `editorial-revision-${stableKey}`,
      correlationId: `correlation-editorial-revision-${stableKey}`,
      expectedUpdatedAt: input.expectedUpdatedAt,
      now: input.now,
    },
  );
}
