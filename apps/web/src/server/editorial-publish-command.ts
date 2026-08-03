import {
  SqliteEditorialWriteRepository,
  type SqliteDatabase,
} from "@semogtw/database";
import {
  EditorialWriteService,
  type EditorialWriteResult,
} from "@semogtw/domain";

export type PublishEditorialRevisionCommandInput = {
  documentId: string;
  revisionId: string;
  ownerId: string;
  idempotencyKey: string;
  expectedUpdatedAt: string;
  now: string;
};

export async function publishEditorialRevisionCommand(
  database: SqliteDatabase,
  input: PublishEditorialRevisionCommandInput,
): Promise<EditorialWriteResult> {
  const stableKey = input.idempotencyKey.trim();
  const service = new EditorialWriteService(
    new SqliteEditorialWriteRepository(database),
  );

  return service.publish(
    {
      documentId: input.documentId,
      revisionId: input.revisionId,
    },
    {
      actorId: input.ownerId,
      eventId: `editorial-event-publish-${stableKey}`,
      idempotencyKey: `editorial-publish-${stableKey}`,
      correlationId: `correlation-editorial-publish-${stableKey}`,
      expectedUpdatedAt: input.expectedUpdatedAt,
      now: input.now,
    },
  );
}
