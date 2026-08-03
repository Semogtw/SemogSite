import {
  SqliteEditorialWriteRepository,
  type SqliteDatabase,
} from "@semogtw/database";
import {
  EditorialWriteService,
  type EditorialWriteResult,
} from "@semogtw/domain";

export type WithdrawEditorialPublicationCommandInput = {
  documentId: string;
  ownerId: string;
  idempotencyKey: string;
  expectedUpdatedAt: string;
  reason: string;
  now: string;
};

export async function withdrawEditorialPublicationCommand(
  database: SqliteDatabase,
  input: WithdrawEditorialPublicationCommandInput,
): Promise<EditorialWriteResult> {
  const stableKey = input.idempotencyKey.trim();
  const service = new EditorialWriteService(
    new SqliteEditorialWriteRepository(database),
  );

  return service.withdraw(
    {
      documentId: input.documentId,
      reason: input.reason,
    },
    {
      actorId: input.ownerId,
      eventId: `editorial-event-withdraw-${stableKey}`,
      idempotencyKey: `editorial-withdraw-${stableKey}`,
      correlationId: `correlation-editorial-withdraw-${stableKey}`,
      expectedUpdatedAt: input.expectedUpdatedAt,
      now: input.now,
    },
  );
}
