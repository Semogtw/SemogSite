import {
  SqliteEditorialWriteRepository,
  type SqliteDatabase,
} from "@semogtw/database";
import {
  EditorialWriteService,
  type EditorialSensitiveReviewChecks,
  type EditorialWriteResult,
} from "@semogtw/domain";

export type ApproveEditorialRevisionCommandInput = {
  documentId: string;
  revisionId: string;
  ownerId: string;
  idempotencyKey: string;
  expectedUpdatedAt: string;
  reason: string;
  notes: string | null;
  checks: EditorialSensitiveReviewChecks;
  now: string;
};

export async function approveEditorialRevisionCommand(
  database: SqliteDatabase,
  input: ApproveEditorialRevisionCommandInput,
): Promise<EditorialWriteResult> {
  const stableKey = input.idempotencyKey.trim();
  const service = new EditorialWriteService(
    new SqliteEditorialWriteRepository(database),
  );

  return service.approve(
    {
      documentId: input.documentId,
      revisionId: input.revisionId,
      approvalId: `editorial-approval-${stableKey}`,
      reason: input.reason,
      notes: input.notes,
      checks: input.checks,
    },
    {
      actorId: input.ownerId,
      eventId: `editorial-event-approve-${stableKey}`,
      idempotencyKey: `editorial-approve-${stableKey}`,
      correlationId: `correlation-editorial-approve-${stableKey}`,
      expectedUpdatedAt: input.expectedUpdatedAt,
      now: input.now,
    },
  );
}
