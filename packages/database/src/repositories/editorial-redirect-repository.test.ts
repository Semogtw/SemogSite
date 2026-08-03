import { EditorialRedirectService } from "@semogtw/domain";
import { afterEach, describe, expect, it } from "vitest";
import { createSqliteDatabase, migrate, type SqliteDatabase } from "../adapters/sqlite";
import { SqliteEditorialRedirectRepository } from "./editorial-redirect-repository";

const opened: SqliteDatabase[] = [];
const createdAt = "2026-08-03T00:00:00.000Z";
const publishedAt = "2026-08-03T00:05:00.000Z";
const hash = "a".repeat(64);

function database(): SqliteDatabase {
  const db = createSqliteDatabase(":memory:");
  opened.push(db);
  migrate(db);
  const transaction = db.$client.transaction(() => {
    db.$client.prepare(`
      INSERT INTO editorial_documents (
        id, kind, slug, workflow_status, publication_status,
        working_revision_id, approved_revision_id, published_revision_id,
        last_published_revision_id, version, created_at, updated_at
      ) VALUES
        ('note-1', 'note', 'nota-atual', 'draft', 'unpublished',
         'revision-1', NULL, NULL, NULL, 1, ?, ?),
        ('draft-1', 'note', 'rascunho', 'draft', 'unpublished',
         'revision-2', NULL, NULL, NULL, 1, ?, ?),
        ('project-1', 'project', 'projeto-atual', 'draft', 'unpublished',
         'revision-3', NULL, NULL, NULL, 1, ?, ?)
    `).run(createdAt, createdAt, createdAt, createdAt, createdAt, createdAt);
    db.$client.prepare(`
      INSERT INTO editorial_revisions (
        id, document_id, sequence, title, excerpt, body_markdown, tags_json,
        content_hash, created_by, created_at
      ) VALUES
        ('revision-1', 'note-1', 1, 'Nota', 'Resumo', '# Nota', '[]', ?, 'owner', ?),
        ('revision-2', 'draft-1', 1, 'Rascunho', 'Resumo', '# Rascunho', '[]', ?, 'owner', ?),
        ('revision-3', 'project-1', 1, 'Projeto', 'Resumo', '# Projeto', '[]', ?, 'owner', ?)
    `).run(hash, createdAt, hash, createdAt, hash, createdAt);
    db.$client.prepare(`
      INSERT INTO editorial_reviews (
        id, document_id, revision_id, content_hash, reviewer_id, reason, notes,
        credentials_reviewed, personal_data_reviewed,
        operational_metadata_reviewed, external_links_reviewed,
        legal_attribution_reviewed, factual_claims_reviewed,
        markdown_safety_reviewed, reviewed_at, idempotency_key
      ) VALUES
        ('review-note-1', 'note-1', 'revision-1', ?, 'owner', 'Reviewed.', NULL,
         1, 1, 1, 1, 1, 1, 1, ?, 'review-note-key'),
        ('review-project-1', 'project-1', 'revision-3', ?, 'owner', 'Reviewed.', NULL,
         1, 1, 1, 1, 1, 1, 1, ?, 'review-project-key')
    `).run(hash, publishedAt, hash, publishedAt);
    db.$client.prepare(`
      UPDATE editorial_documents
      SET workflow_status = 'approved', approved_revision_id = working_revision_id,
          publication_status = 'published', published_revision_id = working_revision_id,
          last_published_revision_id = working_revision_id, version = 2,
          updated_at = ?
      WHERE id IN ('note-1', 'project-1')
    `).run(publishedAt);
  });
  transaction.immediate();
  return db;
}

afterEach(() => {
  while (opened.length > 0) opened.pop()?.$client.close();
});

function context(sequence: number) {
  return {
    actorId: "owner-1",
    eventId: `redirect-event-${sequence}`,
    idempotencyKey: `redirect-key-${sequence}`,
    correlationId: `redirect-correlation-${sequence}`,
    now: `2026-08-03T00:${String(10 + sequence).padStart(2, "0")}:00.000Z`,
  };
}

const request = {
  sourceSlug: "nota-antiga",
  kind: "note" as const,
  targetDocumentId: "note-1",
  reason: "Preservar endereço anterior.",
  confirmed: true,
};

describe("SqliteEditorialRedirectRepository", () => {
  it("persists creation and audit atomically and replays idempotently", async () => {
    const db = database();
    const service = new EditorialRedirectService(new SqliteEditorialRedirectRepository(db));

    await expect(service.create(request, context(1))).resolves.toMatchObject({
      ok: true,
      duplicate: false,
      event: { sourceSlug: "nota-antiga", sequence: 1, action: "created" },
    });
    await expect(service.create(request, context(1))).resolves.toMatchObject({
      ok: true,
      duplicate: true,
      event: { sequence: 1 },
    });
    expect(db.$client.prepare("SELECT count(*) AS count FROM editorial_redirect_events").get()).toEqual({ count: 1 });
    expect(db.$client.prepare("SELECT action, entity_id FROM audit_events WHERE id = ?").get("redirect-event-1")).toEqual({
      action: "editorial.redirect_created",
      entity_id: "nota-antiga",
    });
  });

  it("rejects canonical conflicts, unpublished targets and kind mismatches", async () => {
    const service = new EditorialRedirectService(new SqliteEditorialRedirectRepository(database()));
    await expect(service.create({ ...request, sourceSlug: "nota-atual" }, context(1))).resolves.toEqual({ ok: false, code: "SOURCE_MATCHES_TARGET" });
    await expect(service.create({ ...request, sourceSlug: "projeto-atual" }, context(2))).resolves.toEqual({ ok: false, code: "SOURCE_CANONICAL_CONFLICT" });
    await expect(service.create({ ...request, sourceSlug: "rascunho-antigo", targetDocumentId: "draft-1" }, context(3))).resolves.toEqual({ ok: false, code: "TARGET_NOT_PUBLISHED" });
    await expect(service.create({ ...request, sourceSlug: "projeto-antigo", targetDocumentId: "project-1" }, context(4))).resolves.toEqual({ ok: false, code: "TARGET_KIND_MISMATCH" });
  });

  it("appends revoke and later reactivation without rewriting history", async () => {
    const db = database();
    const service = new EditorialRedirectService(new SqliteEditorialRedirectRepository(db));
    const created = await service.create(request, context(1));
    expect(created.ok).toBe(true);
    const revoked = await service.revoke({ ...request, reason: "Revogar alias antigo." }, context(2));
    expect(revoked).toMatchObject({ ok: true, event: { sequence: 2, action: "revoked" } });
    const reactivated = await service.create({ ...request, reason: "Reativar alias auditado." }, context(3));
    expect(reactivated).toMatchObject({ ok: true, event: { sequence: 3, action: "created" } });
    expect(db.$client.prepare("SELECT sequence, action FROM editorial_redirect_events ORDER BY sequence").all()).toEqual([
      { sequence: 1, action: "created" },
      { sequence: 2, action: "revoked" },
      { sequence: 3, action: "created" },
    ]);
  });

  it("returns conflict when the target changes after the optimistic read", async () => {
    const db = database();
    const repository = new SqliteEditorialRedirectRepository(db);
    const target = await repository.findTargetDocument("note-1");
    if (target === null) throw new Error("missing target");
    db.$client.prepare("UPDATE editorial_documents SET version = 3, updated_at = ? WHERE id = 'note-1'").run("2026-08-03T00:09:00.000Z");
    await expect(repository.appendCreate({
      id: "redirect-event-stale",
      sourceSlug: "nota-stale",
      kind: "note",
      targetDocumentId: "note-1",
      action: "created",
      actor: "owner-1",
      reason: "Teste de concorrência.",
      occurredAt: "2026-08-03T00:10:00.000Z",
      idempotencyKey: "redirect-key-stale",
      correlationId: "redirect-correlation-stale",
    }, { expectedLatestEventId: null, expectedTargetUpdatedAt: target.updatedAt })).resolves.toEqual({ status: "conflict" });
  });
});
