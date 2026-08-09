export type CooperativeRunLedgerEvent = {
  id: string;
  sequence: number;
  kind: string;
  actor: string;
  source: string;
  summary: string;
  before: unknown;
  after: unknown;
  occurredAt: string;
  idempotencyKey: string;
  correlationId: string;
};
