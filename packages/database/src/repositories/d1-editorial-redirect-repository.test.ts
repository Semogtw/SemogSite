import type {
  EditorialRedirectEventDraft,
  EditorialRedirectEventSnapshot,
} from "@semogtw/domain";
import { describe, expect, it } from "vitest";
import type {
  D1DatabaseBinding,
  D1PreparedStatementBinding,
  D1QueryResult,
} from "../adapters/d1";
import { D1EditorialRedirectRepository } from "./d1-editorial-redirect-repository";

class Statement implements D1PreparedStatementBinding {
  constructor(
    readonly owner: CapturingD1,
    readonly sql: string,
    readonly params: readonly unknown[] = [],
  ) {}
  bind(...values: readonly unknown[]): D1PreparedStatementBinding {
    return new Statement(this.owner, this.sql, values);
  }
  async all<Row>(): Promise<D1QueryResult<Row>> {
    return (this.owner.allResponses.shift() ?? {
      results: [],
      success: true,
    }) as D1QueryResult<Row>;
  }
  async first<Row>(): Promise<Row | null> {
    return null;
  }
  async raw<Row extends readonly unknown[]>(): Promise<readonly Row[]> {
    return [];
  }
  async run(): Promise<D1QueryResult> {
    return { results: [], success: true };
  }
}

class CapturingD1 implements D1DatabaseBinding {
  readonly batches: Statement[][] = [];
  readonly allResponses: D1QueryResult[] = [];
  batchResults: readonly D1QueryResult[] = [
    { results: [], success: true, meta: { changes: 1 } },
    { results: [], success: true, meta: { changes: 1 } },
  ];
  prepare(query: string): D1PreparedStatementBinding {
    return new Statement(this, query);
  }
  async batch(
    statements: readonly D1PreparedStatementBinding[],
  ): Promise<readonly D1QueryResult[]> {
    this.batches.push(statements as Statement[]);
    return this.batchResults;
  }
}

const draft: EditorialRedirectEventDraft = {
  id: "redirect-event-1",
  sourceSlug: "old-project",
  kind: "project",
  targetDocumentId: "document-1",
  action: "created",
  actor: "semogtw-owner",
  reason: "Preservar URL antiga.",
  occurredAt: "2026-08-09T20:30:00.000Z",
  idempotencyKey: "redirect-create-1",
  correlationId: "redirect-correlation-1",
};
const created: EditorialRedirectEventSnapshot = { ...draft, sequence: 1 };

function redirectRow(event: EditorialRedirectEventSnapshot) {
  return {
    id: event.id,
    source_slug: event.sourceSlug,
    kind: event.kind,
    target_document_id: event.targetDocumentId,
    sequence: event.sequence,
    action: event.action,
    actor: event.actor,
    reason: event.reason,
    occurred_at: event.occurredAt,
    idempotency_key: event.idempotencyKey,
    correlation_id: event.correlationId,
  };
}

function targetRow(overrides: Record<string, unknown> = {}) {
  return {
    id: draft.targetDocumentId,
    kind: draft.kind,
    slug: "new-project",
    publication_status: "published",
    updated_at: "2026-08-09T20:00:00.000Z",
    ...overrides,
  };
}

describe("D1EditorialRedirectRepository", () => {
  it("loads replay, canonical target and latest event snapshots", async () => {
    const binding = new CapturingD1();
    binding.allResponses.push(
      { success: true, results: [redirectRow(created)] },
      { success: true, results: [targetRow()] },
      { success: true, results: [redirectRow(created)] },
    );
    const repository = new D1EditorialRedirectRepository(binding);

    await expect(repository.findReplay(draft.idempotencyKey)).resolves.toEqual(created);
    await expect(repository.findTargetDocument(draft.targetDocumentId)).resolves.toMatchObject({
      id: draft.targetDocumentId,
      publicationStatus: "published",
    });
    await expect(repository.findLatestEvent(draft.sourceSlug)).resolves.toEqual(created);
  });

  it("creates an event only when target/canonical/latest expectations still hold and audits it in the batch", async () => {
    const binding = new CapturingD1();
    binding.allResponses.push({ success: true, results: [redirectRow(created)] });
    const repository = new D1EditorialRedirectRepository(binding);

    await expect(
      repository.appendCreate(draft, {
        expectedLatestEventId: null,
        expectedTargetUpdatedAt: "2026-08-09T20:00:00.000Z",
      }),
    ).resolves.toEqual({ status: "created", event: created });

    const [eventInsert, auditInsert] = binding.batches[0] ?? [];
    expect(eventInsert?.sql).toContain("MAX(sequence)");
    expect(eventInsert?.sql).toContain("target.publication_status = 'published'");
    expect(eventInsert?.sql).toContain("target.updated_at = ?");
    expect(eventInsert?.sql).toContain("NOT EXISTS (SELECT 1 FROM editorial_documents WHERE slug = ?)");
    expect(eventInsert?.sql).toContain("ORDER BY sequence DESC");
    expect(auditInsert?.sql).toContain("WHERE changes() = 1");
    expect(auditInsert?.sql).toContain("'editorial_redirect'");
  });

  it("revalidates the exact active redirect when revoking", async () => {
    const revoke: EditorialRedirectEventDraft = {
      ...draft,
      id: "redirect-event-2",
      action: "revoked",
      reason: "URL legada descontinuada.",
      idempotencyKey: "redirect-revoke-1",
      correlationId: "redirect-correlation-2",
    };
    const stored = { ...revoke, sequence: 2 } as EditorialRedirectEventSnapshot;
    const binding = new CapturingD1();
    binding.allResponses.push({ success: true, results: [redirectRow(stored)] });
    const repository = new D1EditorialRedirectRepository(binding);

    await expect(
      repository.appendRevoke(revoke, { expectedLatestEventId: created.id }),
    ).resolves.toEqual({ status: "created", event: stored });
    const [eventInsert] = binding.batches[0] ?? [];
    expect(eventInsert?.sql).toContain("latest.action = 'created'");
    expect(eventInsert?.sql).toContain("latest.kind = ?");
    expect(eventInsert?.sql).toContain("latest.target_document_id = ?");
  });

  it("classifies a zero-row create from final persisted state", async () => {
    const binding = new CapturingD1();
    binding.batchResults = [
      { results: [], success: true, meta: { changes: 0 } },
      { results: [], success: true, meta: { changes: 0 } },
    ];
    binding.allResponses.push(
      { success: true, results: [] },
      { success: true, results: [targetRow({ publication_status: "draft" })] },
      { success: true, results: [] },
    );
    const repository = new D1EditorialRedirectRepository(binding);

    await expect(
      repository.appendCreate(draft, {
        expectedLatestEventId: null,
        expectedTargetUpdatedAt: "2026-08-09T20:00:00.000Z",
      }),
    ).resolves.toEqual({ status: "target_not_published" });
  });

  it("returns duplicate for a final-state replay and lets the domain compare intent", async () => {
    const binding = new CapturingD1();
    binding.batchResults = [
      { results: [], success: true, meta: { changes: 0 } },
      { results: [], success: true, meta: { changes: 0 } },
    ];
    binding.allResponses.push({ success: true, results: [redirectRow(created)] });
    const repository = new D1EditorialRedirectRepository(binding);

    await expect(
      repository.appendCreate(draft, {
        expectedLatestEventId: null,
        expectedTargetUpdatedAt: "2026-08-09T20:00:00.000Z",
      }),
    ).resolves.toEqual({ status: "duplicate", event: created });
  });

  it("fails closed when a successful insert does not provide reliable changes metadata", async () => {
    const binding = new CapturingD1();
    binding.batchResults = [
      { results: [], success: true },
      { results: [], success: true },
    ];
    const repository = new D1EditorialRedirectRepository(binding);

    await expect(
      repository.appendCreate(draft, {
        expectedLatestEventId: null,
        expectedTargetUpdatedAt: "2026-08-09T20:00:00.000Z",
      }),
    ).rejects.toThrow("missing changes metadata");
  });
});
