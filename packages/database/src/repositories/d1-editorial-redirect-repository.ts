import type {
  EditorialRedirectEventDraft,
  EditorialRedirectEventSnapshot,
  EditorialRedirectRepository,
  EditorialRedirectStoreResult,
  EditorialRedirectTargetSnapshot,
} from "@semogtw/domain";
import type {
  D1DatabaseBinding,
  D1QueryResult,
} from "../adapters/d1";
import {
  assertD1BatchSucceeded,
  readD1SingleRowChange,
} from "./d1-write-result";

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


function sameDraft(
  replay: EditorialRedirectEventSnapshot,
  draft: EditorialRedirectEventDraft,
): boolean {
  return (
    replay.id === draft.id &&
    replay.sourceSlug === draft.sourceSlug &&
    replay.kind === draft.kind &&
    replay.targetDocumentId === draft.targetDocumentId &&
    replay.action === draft.action &&
    replay.actor === draft.actor &&
    replay.reason === draft.reason &&
    replay.occurredAt === draft.occurredAt &&
    replay.idempotencyKey === draft.idempotencyKey &&
    replay.correlationId === draft.correlationId
  );
}

export class D1EditorialRedirectRepository implements EditorialRedirectRepository {
  constructor(private readonly database: D1DatabaseBinding) {}

  async findReplay(idempotencyKey: string): Promise<EditorialRedirectEventSnapshot | null> {
    const result = await this.database
      .prepare(`${redirectSelect} WHERE idempotency_key = ? LIMIT 1`)
      .bind(idempotencyKey)
      .all<RedirectRow>();
    this.assertRead(result, "replay");
    const row = result.results[0];
    return row === undefined ? null : toEvent(row);
  }

  async findCanonicalDocumentBySlug(
    slug: string,
  ): Promise<EditorialRedirectTargetSnapshot | null> {
    return this.findTarget("slug", slug);
  }

  async findTargetDocument(
    documentId: string,
  ): Promise<EditorialRedirectTargetSnapshot | null> {
    return this.findTarget("id", documentId);
  }

  async findLatestEvent(
    sourceSlug: string,
  ): Promise<EditorialRedirectEventSnapshot | null> {
    const result = await this.database
      .prepare(
        `${redirectSelect}
         WHERE source_slug = ?
         ORDER BY sequence DESC
         LIMIT 1`,
      )
      .bind(sourceSlug)
      .all<RedirectRow>();
    this.assertRead(result, "latest event");
    const row = result.results[0];
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

  private async append(
    event: EditorialRedirectEventDraft,
    expectation: {
      expectedLatestEventId: string | null;
      expectedTargetUpdatedAt?: string;
    },
  ): Promise<EditorialRedirectStoreResult> {
    const create = event.action === "created";
    const eventInsert = this.database
      .prepare(
        `INSERT INTO editorial_redirect_events (
          id, source_slug, kind, target_document_id, sequence, action, actor,
          reason, occurred_at, idempotency_key, correlation_id
        )
        SELECT
          ?, ?, ?, ?,
          COALESCE((SELECT MAX(sequence) FROM editorial_redirect_events WHERE source_slug = ?), 0) + 1,
          ?, ?, ?, ?, ?, ?
        WHERE NOT EXISTS (
          SELECT 1 FROM editorial_redirect_events WHERE idempotency_key = ?
        )
          AND EXISTS (
            SELECT 1 FROM editorial_documents AS target
            WHERE target.id = ?
              AND target.kind = ?
              ${create ? "AND target.publication_status = 'published'" : ""}
              ${create ? "AND target.updated_at = ?" : ""}
              ${create ? "AND target.slug <> ?" : ""}
          )
          ${create ? "AND NOT EXISTS (SELECT 1 FROM editorial_documents WHERE slug = ?)" : ""}
          AND COALESCE((
            SELECT id FROM editorial_redirect_events
            WHERE source_slug = ?
            ORDER BY sequence DESC
            LIMIT 1
          ), '') = COALESCE(?, '')
          AND (
            ? = 'created'
            OR EXISTS (
              SELECT 1 FROM editorial_redirect_events AS latest
              WHERE latest.source_slug = ?
                AND latest.id = ?
                AND latest.action = 'created'
                AND latest.kind = ?
                AND latest.target_document_id = ?
            )
          )`,
      );

    const common = [
      event.id,
      event.sourceSlug,
      event.kind,
      event.targetDocumentId,
      event.sourceSlug,
      event.action,
      event.actor,
      event.reason,
      event.occurredAt,
      event.idempotencyKey,
      event.correlationId,
      event.idempotencyKey,
      event.targetDocumentId,
      event.kind,
    ] as unknown[];
    if (create) {
      common.push(
        expectation.expectedTargetUpdatedAt as string,
        event.sourceSlug,
        event.sourceSlug,
      );
    }
    common.push(
      event.sourceSlug,
      expectation.expectedLatestEventId,
      event.action,
      event.sourceSlug,
      expectation.expectedLatestEventId,
      event.kind,
      event.targetDocumentId,
    );
    const boundEvent = eventInsert.bind(...common);

    const auditInsert = this.database
      .prepare(
        `INSERT INTO audit_events (
          id, actor, action, entity_type, entity_id, before_json, after_json,
          reason, occurred_at, source, confirmed, correlation_id
        )
        SELECT ?, ?, ?, 'editorial_redirect', ?,
          (
            SELECT json_object(
              'id', previous.id,
              'sourceSlug', previous.source_slug,
              'kind', previous.kind,
              'targetDocumentId', previous.target_document_id,
              'sequence', previous.sequence,
              'action', previous.action,
              'actor', previous.actor,
              'reason', previous.reason,
              'occurredAt', previous.occurred_at,
              'idempotencyKey', previous.idempotency_key,
              'correlationId', previous.correlation_id
            )
            FROM editorial_redirect_events AS previous
            WHERE previous.source_slug = ?
              AND previous.sequence = (
                SELECT MAX(sequence) - 1
                FROM editorial_redirect_events
                WHERE source_slug = ?
              )
          ),
          (
            SELECT json_object(
              'id', current.id,
              'sourceSlug', current.source_slug,
              'kind', current.kind,
              'targetDocumentId', current.target_document_id,
              'sequence', current.sequence,
              'action', current.action,
              'actor', current.actor,
              'reason', current.reason,
              'occurredAt', current.occurred_at,
              'idempotencyKey', current.idempotency_key,
              'correlationId', current.correlation_id
            )
            FROM editorial_redirect_events AS current
            WHERE current.id = ?
          ),
          ?, ?, 'devos', 1, ?
        WHERE changes() = 1`,
      )
      .bind(
        event.id,
        event.actor,
        create ? "editorial.redirect_created" : "editorial.redirect_revoked",
        event.sourceSlug,
        event.sourceSlug,
        event.sourceSlug,
        event.id,
        event.reason,
        event.occurredAt,
        event.correlationId,
      );

    let results: readonly D1QueryResult[];
    try {
      results = await this.database.batch([boundEvent, auditInsert]);
      assertD1BatchSucceeded(results, "editorial redirect");
    } catch {
      return this.classifyFailedAppend(event, expectation);
    }

    const changed = readD1SingleRowChange(results[0], "editorial redirect");
    if (changed === 1) {
      if (readD1SingleRowChange(results[1], "editorial redirect audit insert") !== 1) {
        throw new Error("D1 editorial redirect audit is incomplete.");
      }
      const stored = await this.findReplay(event.idempotencyKey);
      if (stored === null) throw new Error("D1 editorial redirect insert disappeared.");
      return { status: "created", event: stored };
    }
    return this.classifyFailedAppend(event, expectation);
  }

  private async classifyFailedAppend(
    event: EditorialRedirectEventDraft,
    expectation: {
      expectedLatestEventId: string | null;
      expectedTargetUpdatedAt?: string;
    },
  ): Promise<EditorialRedirectStoreResult> {
    const replay = await this.findReplay(event.idempotencyKey);
    if (replay !== null) {
      return { status: "duplicate", event: replay };
    }

    const target = await this.findTargetDocument(event.targetDocumentId);
    if (target === null) return { status: "target_not_found" };
    if (target.kind !== event.kind) return { status: "target_kind_mismatch" };

    const latest = await this.findLatestEvent(event.sourceSlug);
    if ((latest?.id ?? null) !== expectation.expectedLatestEventId) {
      return { status: "conflict" };
    }

    if (event.action === "created") {
      if (target.publicationStatus !== "published") {
        return { status: "target_not_published" };
      }
      if (
        expectation.expectedTargetUpdatedAt === undefined ||
        target.updatedAt !== expectation.expectedTargetUpdatedAt
      ) {
        return { status: "conflict" };
      }
      const canonical = await this.findCanonicalDocumentBySlug(event.sourceSlug);
      if (canonical !== null) return { status: "source_canonical_conflict" };
      if (latest?.action === "created") return { status: "redirect_already_active" };
    } else if (
      latest === null ||
      latest.action !== "created" ||
      latest.kind !== event.kind ||
      latest.targetDocumentId !== event.targetDocumentId
    ) {
      return { status: "redirect_not_active" };
    }

    return { status: "conflict" };
  }

  private async findTarget(
    column: "id" | "slug",
    value: string,
  ): Promise<EditorialRedirectTargetSnapshot | null> {
    const result = await this.database
      .prepare(
        `SELECT id, kind, slug, publication_status, updated_at
         FROM editorial_documents
         WHERE ${column} = ?
         LIMIT 1`,
      )
      .bind(value)
      .all<TargetRow>();
    this.assertRead(result, "target");
    const row = result.results[0];
    return row === undefined ? null : toTarget(row);
  }

  private assertRead<Row>(result: D1QueryResult<Row>, operation: string): void {
    if (result.success === false || (result.error?.length ?? 0) > 0) {
      throw new Error(`D1 editorial redirect ${operation} lookup failed.`);
    }
  }
}
