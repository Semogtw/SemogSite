import type {
  EditorialRedirectEventDraft,
  EditorialRedirectEventSnapshot,
  EditorialRedirectRepository,
  EditorialRedirectStoreResult,
  EditorialRedirectTargetSnapshot,
} from "@semogtw/domain";
import type { SqliteDatabase } from "../adapters/sqlite";

type RedirectRow = {
  id: string;
  source_slug: string;
  kind: EditorialRedirectEventSnapshot["kind"];
  target_document_id: string;
  sequence: number;
  action: EditorialRedirectEventSnapshot["action"];
  actor: string;
  reason: string;
  occurred_at: string;
  idempotency_key: string;
  correlation_id: string;
};

type TargetRow = {
  id: string;
  kind: EditorialRedirectTargetSnapshot["kind"];
  slug: string;
  publication_status: EditorialRedirectTargetSnapshot["publicationStatus"];
  updated_at: string;
};

const redirectSelect = `
  SELECT id, source_slug, kind, target_document_id, sequence, action, actor,
         reason, occurred_at, idempotency_key, correlation_id
  FROM editorial_redirect_events`;

function toEvent(row: RedirectRow): EditorialRedirectEventSnapshot {
  return {
    id: row.id,
    sourceSlug: row.source_slug,
    kind: row.kind,
    targetDocumentId: row.target_document_id,
    sequence: row.sequence,
    action: row.action,
    actor: row.actor,
    reason: row.reason,
    occurredAt: row.occurred_at,
    idempotencyKey: row.idempotency_key,
    correlationId: row.correlation_id,
  };
}

function toTarget(row: TargetRow): EditorialRedirectTargetSnapshot {
  return {
    id: row.id,
    kind: row.kind,
    slug: row.slug,
    publicationStatus: row.publication_status,
    updatedAt: row.updated_at,
  };
}

export class SqliteEditorialRedirectRepository
  implements EditorialRedirectRepository
{
  constructor(private readonly database: SqliteDatabase) {}

  async findReplay(
    idempotencyKey: string,
  ): Promise<EditorialRedirectEventSnapshot | null> {
    const row = this.database.$client
      .prepare(`${redirectSelect} WHERE idempotency_key = ? LIMIT 1`)
      .get(idempotencyKey) as RedirectRow | undefined;
    return row === undefined ? null : toEvent(row);
  }

  async findCanonicalDocumentBySlug(
    slug: string,
  ): Promise<EditorialRedirectTargetSnapshot | null> {
    const row = this.database.$client
      .prepare(
        `SELECT id, kind, slug, publication_status, updated_at
         FROM editorial_documents
         WHERE slug = ?
         LIMIT 1`,
      )
      .get(slug) as TargetRow | undefined;
    return row === undefined ? null : toTarget(row);
  }

  async findTargetDocument(
    documentId: string,
  ): Promise<EditorialRedirectTargetSnapshot | null> {
    const row = this.database.$client
      .prepare(
        `SELECT id, kind, slug, publication_status, updated_at
         FROM editorial_documents
         WHERE id = ?
         LIMIT 1`,
      )
      .get(documentId) as TargetRow | undefined;
    return row === undefined ? null : toTarget(row);
  }

  async findLatestEvent(
    sourceSlug: string,
  ): Promise<EditorialRedirectEventSnapshot | null> {
    const row = this.latest(sourceSlug);
    return row === undefined ? null : toEvent(row);
  }

  async appendCreate(
    event: EditorialRedirectEventDraft,
    expectation: {
      expectedLatestEventId: string | null;
      expectedTargetUpdatedAt: string;
    },
  ): Promise<EditorialRedirectStoreResult> {
    return this.append(event, expectation);
  }

  async appendRevoke(
    event: EditorialRedirectEventDraft,
    expectation: { expectedLatestEventId: string },
  ): Promise<EditorialRedirectStoreResult> {
    return this.append(event, expectation);
  }

  private append(
    event: EditorialRedirectEventDraft,
    expectation: {
      expectedLatestEventId: string | null;
      expectedTargetUpdatedAt?: string;
    },
  ): EditorialRedirectStoreResult {
    const transaction = this.database.$client.transaction(() => {
      const replay = this.replay(event.idempotencyKey);
      if (replay !== undefined) {
        return { status: "duplicate" as const, event: toEvent(replay) };
      }

      const target = this.target(event.targetDocumentId);
      if (target === undefined) return { status: "target_not_found" as const };
      if (target.kind !== event.kind) {
        return { status: "target_kind_mismatch" as const };
      }

      const latest = this.latest(event.sourceSlug);
      if ((latest?.id ?? null) !== expectation.expectedLatestEventId) {
        return { status: "conflict" as const };
      }

      if (event.action === "created") {
        if (target.publication_status !== "published") {
          return { status: "target_not_published" as const };
        }
        if (
          expectation.expectedTargetUpdatedAt === undefined ||
          target.updated_at !== expectation.expectedTargetUpdatedAt
        ) {
          return { status: "conflict" as const };
        }
        const canonical = this.database.$client
          .prepare("SELECT id FROM editorial_documents WHERE slug = ? LIMIT 1")
          .get(event.sourceSlug) as { id: string } | undefined;
        if (canonical !== undefined) {
          return { status: "source_canonical_conflict" as const };
        }
        if (latest?.action === "created") {
          return { status: "redirect_already_active" as const };
        }
      } else {
        if (
          latest === undefined ||
          latest.action !== "created" ||
          latest.kind !== event.kind ||
          latest.target_document_id !== event.targetDocumentId
        ) {
          return { status: "redirect_not_active" as const };
        }
      }

      const snapshot: EditorialRedirectEventSnapshot = {
        ...event,
        sequence: (latest?.sequence ?? 0) + 1,
      };
      this.database.$client
        .prepare(
          `INSERT INTO editorial_redirect_events (
            id, source_slug, kind, target_document_id, sequence, action, actor,
            reason, occurred_at, idempotency_key, correlation_id
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          snapshot.id,
          snapshot.sourceSlug,
          snapshot.kind,
          snapshot.targetDocumentId,
          snapshot.sequence,
          snapshot.action,
          snapshot.actor,
          snapshot.reason,
          snapshot.occurredAt,
          snapshot.idempotencyKey,
          snapshot.correlationId,
        );

      this.database.$client
        .prepare(
          `INSERT INTO audit_events (
            id, actor, action, entity_type, entity_id, before_json, after_json,
            reason, occurred_at, source, confirmed, correlation_id
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          snapshot.id,
          snapshot.actor,
          snapshot.action === "created"
            ? "editorial.redirect_created"
            : "editorial.redirect_revoked",
          "editorial_redirect",
          snapshot.sourceSlug,
          latest === undefined ? null : JSON.stringify(toEvent(latest)),
          JSON.stringify(snapshot),
          snapshot.reason,
          snapshot.occurredAt,
          "devos",
          1,
          snapshot.correlationId,
        );
      return { status: "created" as const, event: snapshot };
    });

    try {
      return transaction.immediate();
    } catch {
      const replay = this.replay(event.idempotencyKey);
      return replay === undefined
        ? { status: "conflict" }
        : { status: "duplicate", event: toEvent(replay) };
    }
  }

  private replay(idempotencyKey: string): RedirectRow | undefined {
    return this.database.$client
      .prepare(`${redirectSelect} WHERE idempotency_key = ? LIMIT 1`)
      .get(idempotencyKey) as RedirectRow | undefined;
  }

  private latest(sourceSlug: string): RedirectRow | undefined {
    return this.database.$client
      .prepare(
        `${redirectSelect}
         WHERE source_slug = ?
         ORDER BY sequence DESC
         LIMIT 1`,
      )
      .get(sourceSlug) as RedirectRow | undefined;
  }

  private target(documentId: string): TargetRow | undefined {
    return this.database.$client
      .prepare(
        `SELECT id, kind, slug, publication_status, updated_at
         FROM editorial_documents
         WHERE id = ?
         LIMIT 1`,
      )
      .get(documentId) as TargetRow | undefined;
  }
}
