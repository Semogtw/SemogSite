import { describe, expect, it } from "vitest";
import type {
  EditorialApprovalSnapshot,
  EditorialDocumentSnapshot,
  EditorialPersistenceEvent,
  EditorialRevisionSnapshot,
} from "@semogtw/domain";
import { createSqliteDatabase, migrate } from "../adapters/sqlite";
import { SqliteEditorialWriteRepository } from "./editorial-write-repository";

const t0 = "2026-08-01T23:00:00.000Z";
const t1 = "2026-08-01T23:10:00.000Z";
const t2 = "2026-08-01T23:20:00.000Z";
const hashA = "a".repeat(64);
const hashB = "b".repeat(64);

function document(
  change: Partial<EditorialDocumentSnapshot> = {},
): EditorialDocumentSnapshot {
  return {
    id: "document-1",
    kind: "project",
    slug: "semog-site",
    workflowStatus: "draft",
    publicationStatus: "unpublished",
    workingRevisionId: "revision-1",
    approvedRevisionId: null,
    publishedRevisionId: null,
    lastPublishedRevisionId: null,
    version: 1,
    createdAt: t0,
    updatedAt: t0,
    ...change,
  };
}

function revision(
  id = "revision-1",
  change: Partial<EditorialRevisionSnapshot> = {},
): EditorialRevisionSnapshot {
  return {
    id,
    documentId: "document-1",
    sequence: id === "revision-1" ? 1 : 2,
    title: id === "revision-1" ? "SemogSite" : "SemogSite 2",
    excerpt: "Descrição pública revisada.",
    bodyMarkdown: "# SemogSite\n\nConteúdo público.",
    tags: ["typescript"],
    contentHash: id === "revision-1" ? hashA : hashB,
    createdBy: "semogtw-owner",
    createdAt: id === "revision-1" ? t0 : t1,
    ...change,
  };
}

function event(
  kind: EditorialPersistenceEvent["kind"],
  before: EditorialDocumentSnapshot | null,
  after: EditorialDocumentSnapshot,
  revisionId: string | null,
  change: Partial<EditorialPersistenceEvent> = {},
): EditorialPersistenceEvent {
  return {
    id: `event-${after.version}`,
    documentId: after.id,
    kind,
    actor: "semogtw-owner",
    revisionId,
    summary: kind,
    reason: null,
    before,
    after,
    occurredAt: after.updatedAt,
    idempotencyKey: `key-${after.version}`,
    correlationId: `correlation-${after.version}`,
    ...change,
  };
}

function approval(): EditorialApprovalSnapshot {
  return {
    id: "approval-1",
    documentId: "document-1",
    revisionId: "revision-1",
    contentHash: hashA,
    reviewerId: "semogtw-owner",
    reason: "Revisão completa.",
    notes: null,
    checks: {
      credentials: true,
      personalData: true,
      operationalMetadata: true,
      externalLinks: true,
      legalAttribution: true,
      factualClaims: true,
      markdownSafety: true,
    },
    reviewedAt: t1,
  };
}

describe("SqliteEditorialWriteRepository", () => {
  it("creates document, first revision and event atomically and idempotently", async () => {
    const database = createSqliteDatabase(":memory:");
    migrate(database);
    const repository = new SqliteEditorialWriteRepository(database);
    const initial = document();
    const firstRevision = revision();
    const createdEvent = event(
      "editorial.document_created",
      null,
      initial,
      null,
    );

    await expect(
      repository.createDocument(initial, firstRevision, createdEvent),
    ).resolves.toBe("created");
    await expect(
      repository.createDocument(initial, firstRevision, createdEvent),
    ).resolves.toBe("duplicate");
    await expect(
      repository.createDocument(
        { ...initial, slug: "different" },
        firstRevision,
        createdEvent,
      ),
    ).resolves.toBe("conflict");

    expect(
      database.$client
        .prepare("SELECT COUNT(*) AS count FROM editorial_documents")
        .get(),
    ).toEqual({ count: 1 });
    expect(
      database.$client
        .prepare("SELECT COUNT(*) AS count FROM editorial_revisions")
        .get(),
    ).toEqual({ count: 1 });
    expect(
      database.$client
        .prepare("SELECT COUNT(*) AS count FROM editorial_events")
        .get(),
    ).toEqual({ count: 1 });
    database.$client.close();
  });

  it("creates a private revision without replacing the published pointer", async () => {
    const database = createSqliteDatabase(":memory:");
    migrate(database);
    const repository = new SqliteEditorialWriteRepository(database);
    const initial = document();
    await repository.createDocument(
      initial,
      revision(),
      event("editorial.document_created", null, initial, null),
    );
    const reviewed = approval();
    const approved = document({
      workflowStatus: "approved",
      approvedRevisionId: "revision-1",
      version: 2,
      updatedAt: t1,
    });
    await repository.applyTransition(
      initial,
      approved,
      event("editorial.approved", initial, approved, "revision-1"),
      reviewed,
    );
    const published = { ...approved, publicationStatus: "published" as const,
      publishedRevisionId: "revision-1", lastPublishedRevisionId: "revision-1",
      version: 3, updatedAt: t2 };
    await repository.applyTransition(
      approved,
      published,
      event("editorial.published", approved, published, "revision-1"),
      null,
    );

    const draft = {
      ...published,
      workflowStatus: "draft" as const,
      workingRevisionId: "revision-2",
      approvedRevisionId: null,
      version: 4,
      updatedAt: "2026-08-01T23:30:00.000Z",
    };
    await expect(
      repository.createRevision(
        published,
        draft,
        revision("revision-2"),
        event("editorial.revision_created", published, draft, "revision-2"),
      ),
    ).resolves.toBe("created");

    await expect(repository.findDocument("document-1")).resolves.toMatchObject({
      workflowStatus: "draft",
      workingRevisionId: "revision-2",
      publicationStatus: "published",
      publishedRevisionId: "revision-1",
    });
    await expect(repository.nextRevisionSequence("document-1")).resolves.toBe(3);
    database.$client.close();
  });

  it("persists approval before the guarded document update and then publishes", async () => {
    const database = createSqliteDatabase(":memory:");
    migrate(database);
    const repository = new SqliteEditorialWriteRepository(database);
    const initial = document();
    await repository.createDocument(
      initial,
      revision(),
      event("editorial.document_created", null, initial, null),
    );
    const inReview = document({
      workflowStatus: "in_review",
      version: 2,
      updatedAt: t1,
    });
    await repository.applyTransition(
      initial,
      inReview,
      event("editorial.submitted_for_review", initial, inReview, "revision-1"),
      null,
    );
    const approved = {
      ...inReview,
      workflowStatus: "approved" as const,
      approvedRevisionId: "revision-1",
      version: 3,
      updatedAt: t2,
    };

    await expect(
      repository.applyTransition(
        inReview,
        approved,
        event("editorial.approved", inReview, approved, "revision-1"),
        approval(),
      ),
    ).resolves.toBe("updated");
    await expect(
      repository.findApproval("document-1", "revision-1", hashA),
    ).resolves.toEqual(approval());

    const published = {
      ...approved,
      publicationStatus: "published" as const,
      publishedRevisionId: "revision-1",
      lastPublishedRevisionId: "revision-1",
      version: 4,
      updatedAt: "2026-08-01T23:30:00.000Z",
    };
    await expect(
      repository.applyTransition(
        approved,
        published,
        event("editorial.published", approved, published, "revision-1"),
        null,
      ),
    ).resolves.toBe("updated");
    database.$client.close();
  });

  it("uses CAS and rolls back document state when event insertion fails", async () => {
    const database = createSqliteDatabase(":memory:");
    migrate(database);
    const repository = new SqliteEditorialWriteRepository(database);
    const initial = document();
    const firstEvent = event(
      "editorial.document_created",
      null,
      initial,
      null,
    );
    await repository.createDocument(initial, revision(), firstEvent);

    const submitted = document({
      workflowStatus: "in_review",
      version: 2,
      updatedAt: t1,
    });
    await expect(
      repository.applyTransition(
        { ...initial, updatedAt: "2026-08-01T22:00:00.000Z" },
        submitted,
        event("editorial.submitted_for_review", initial, submitted, "revision-1"),
        null,
      ),
    ).resolves.toBe("conflict");

    const conflictingEvent = event(
      "editorial.submitted_for_review",
      initial,
      submitted,
      "revision-1",
      { id: firstEvent.id, idempotencyKey: "new-key" },
    );
    await expect(
      repository.applyTransition(initial, submitted, conflictingEvent, null),
    ).rejects.toThrow();
    await expect(repository.findDocument("document-1")).resolves.toEqual(initial);
    database.$client.close();
  });

  it("classifies duplicate exact transitions without appending history twice", async () => {
    const database = createSqliteDatabase(":memory:");
    migrate(database);
    const repository = new SqliteEditorialWriteRepository(database);
    const initial = document();
    await repository.createDocument(
      initial,
      revision(),
      event("editorial.document_created", null, initial, null),
    );
    const submitted = document({
      workflowStatus: "in_review",
      version: 2,
      updatedAt: t1,
    });
    const submittedEvent = event(
      "editorial.submitted_for_review",
      initial,
      submitted,
      "revision-1",
    );

    await expect(
      repository.applyTransition(initial, submitted, submittedEvent, null),
    ).resolves.toBe("updated");
    await expect(
      repository.applyTransition(initial, submitted, submittedEvent, null),
    ).resolves.toBe("duplicate");
    expect(
      database.$client
        .prepare("SELECT COUNT(*) AS count FROM editorial_events")
        .get(),
    ).toEqual({ count: 2 });
    database.$client.close();
  });
});
