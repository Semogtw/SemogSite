import {
  SqliteEditorialWriteRepository,
  type SqliteDatabase,
} from "@semogtw/database";
import {
  EditorialWriteService,
  type EditorialWriteResult,
} from "@semogtw/domain";

export type SubmitEditorialForReviewCommandInput = {
  documentId: string;
  ownerId: string;
  idempotencyKey: string;
  expectedUpdatedAt: string;
  now: string;
};

export async function submitEditorialForReviewCommand(
  database: SqliteDatabase,
  input: SubmitEditorialForReviewCommandInput,
): Promise<EditorialWriteResult> {
  const stableKey = input.idempotencyKey.trim();
  const service = new EditorialWriteService(
    new SqliteEditorialWriteRepository(database),
  );

  return service.submitForReview(
    { documentId: input.documentId },
    {
      actorId: input.ownerId,
      eventId: `editorial-event-submit-${stableKey}`,
      idempotencyKey: `editorial-submit-${stableKey}`,
      correlationId: `correlation-editorial-submit-${stableKey}`,
      expectedUpdatedAt: input.expectedUpdatedAt,
      now: input.now,
    },
  );
}
