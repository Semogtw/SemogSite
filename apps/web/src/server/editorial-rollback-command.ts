import {
  SqliteEditorialWriteRepository,
  type SqliteDatabase,
} from "@semogtw/database";
import {
  EditorialWriteService,
  type EditorialWriteResult,
} from "@semogtw/domain";

export type RollbackEditorialPublicationCommandInput = {
  documentId: string;
  revisionId: string;
  ownerId: string;
  idempotencyKey: string;
  expectedUpdatedAt: string;
  reason: string;
  now: string;
};

export async function rollbackEditorialPublicationCommand(
  database: SqliteDatabase,
  input: RollbackEditorialPublicationCommandInput,
): Promise<EditorialWriteResult> {
  const stableKey = input.idempotencyKey.trim();
  const service = new EditorialWriteService(
    new SqliteEditorialWriteRepository(database),
  );

  return service.rollback(
    {
      documentId: input.documentId,
      revisionId: input.revisionId,
      reason: input.reason,
    },
    {
      actorId: input.ownerId,
      eventId: `editorial-event-rollback-${stableKey}`,
      idempotencyKey: `editorial-rollback-${stableKey}`,
      correlationId: `correlation-editorial-rollback-${stableKey}`,
      expectedUpdatedAt: input.expectedUpdatedAt,
      now: input.now,
    },
  );
}
