import {
  SqliteEditorialWriteRepository,
  type SqliteDatabase,
} from "@semogtw/database";
import {
  EditorialWriteService,
  type EditorialWriteResult,
} from "@semogtw/domain";

export type ReopenEditorialDraftCommandInput = {
  documentId: string;
  ownerId: string;
  idempotencyKey: string;
  expectedUpdatedAt: string;
  reason: string;
  now: string;
};

export async function reopenEditorialDraftCommand(
  database: SqliteDatabase,
  input: ReopenEditorialDraftCommandInput,
): Promise<EditorialWriteResult> {
  const stableKey = input.idempotencyKey.trim();
  const service = new EditorialWriteService(
    new SqliteEditorialWriteRepository(database),
  );

  return service.reopenDraft(
    { documentId: input.documentId, reason: input.reason },
    {
      actorId: input.ownerId,
      eventId: `editorial-event-reopen-${stableKey}`,
      idempotencyKey: `editorial-reopen-${stableKey}`,
      correlationId: `correlation-editorial-reopen-${stableKey}`,
      expectedUpdatedAt: input.expectedUpdatedAt,
      now: input.now,
    },
  );
}
