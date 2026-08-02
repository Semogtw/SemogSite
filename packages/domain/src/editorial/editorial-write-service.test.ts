import { describe, expect, it, vi } from "vitest";
import {
  EditorialWriteService,
  type EditorialWriteRepository,
} from "./editorial-write-service";
import type {
  EditorialApprovalSnapshot,
  EditorialDocumentSnapshot,
  EditorialRevisionSnapshot,
} from "./editorial-workflow";

const t0 = "2026-08-01T23:00:00.000Z";
const t1 = "2026-08-01T23:10:00.000Z";
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
    createdAt: t0,
    ...change,
  };
}

function approval(
  revisionId = "revision-1",
): EditorialApprovalSnapshot {
  return {
    id: `approval-${revisionId}`,
    documentId: "document-1",
    revisionId,
    contentHash: revisionId === "revision-1" ? hashA : hashB,
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

function repository(): EditorialWriteRepository {
  return {
    findReplay: vi.fn().mockResolvedValue(null),
    findDocument: vi.fn().mockResolvedValue(document()),
    findRevision: vi.fn().mockResolvedValue(revision()),
    findApproval: vi.fn().mockResolvedValue(approval()),
    nextRevisionSequence: vi.fn().mockResolvedValue(2),
    createDocument: vi.fn().mockResolvedValue("created"),
    createRevision: vi.fn().mockResolvedValue("created"),
    applyTransition: vi.fn().mockResolvedValue("updated"),
  };
}

const common = {
  actorId: "semogtw-owner",
  eventId: "event-1",
  idempotencyKey: "editorial-key-1",
  correlationId: "editorial-correlation-1",
  now: t1,
} as const;

describe("EditorialWriteService", () => {
  it("creates document, first immutable revision and creation event atomically", async () => {
    const store = repository();
    const service = new EditorialWriteService(store);

    const result = await service.createDocument(
      {
        documentId: "document-1",
        revisionId: "revision-1",
        kind: "project",
        slug: "semog-site",
        title: "SemogSite",
        excerpt: "Descrição pública revisada.",
        bodyMarkdown: "# SemogSite\n\nConteúdo público.",
        tags: ["typescript"],
        contentHash: hashA,
      },
      common,
    );

    expect(result).toMatchObject({
      ok: true,
      document: { id: "document-1", workflowStatus: "draft" },
      revision: { id: "revision-1", sequence: 1 },
    });
    expect(store.createDocument).toHaveBeenCalledWith(
      expect.objectContaining({ id: "document-1" }),
      expect.objectContaining({ id: "revision-1", sequence: 1 }),
      expect.objectContaining({
        id: "event-1",
        kind: "editorial.document_created",
        revisionId: null,
        before: null,
      }),
    );
  });

  it("uses repository sequence rather than aggregate version for a new revision", async () => {
    const store = repository();
    vi.mocked(store.findDocument).mockResolvedValue(
      document({
        workflowStatus: "approved",
        publicationStatus: "published",
        approvedRevisionId: "revision-1",
        publishedRevisionId: "revision-1",
        lastPublishedRevisionId: "revision-1",
        version: 6,
      }),
    );
    vi.mocked(store.nextRevisionSequence).mockResolvedValue(3);
    const service = new EditorialWriteService(store);

    const result = await service.createRevision(
      {
        documentId: "document-1",
        revisionId: "revision-2",
        title: "SemogSite 2",
        excerpt: "Descrição pública revisada.",
        bodyMarkdown: "# SemogSite\n\nConteúdo público.",
        tags: ["typescript"],
        contentHash: hashB,
      },
      { ...common, expectedUpdatedAt: t0 },
    );

    expect(result).toMatchObject({
      ok: true,
      document: {
        workflowStatus: "draft",
        publicationStatus: "published",
        workingRevisionId: "revision-2",
        publishedRevisionId: "revision-1",
        version: 7,
      },
      revision: { id: "revision-2", sequence: 3 },
    });
    expect(store.createRevision).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      expect.objectContaining({ sequence: 3 }),
      expect.objectContaining({ kind: "editorial.revision_created" }),
    );
  });

  it("replays an immutable revision after the aggregate has advanced", async () => {
    const store = repository();
    const before = document();
    const after = document({
      workingRevisionId: "revision-2",
      version: 2,
      updatedAt: t1,
    });
    const persistedRevision = revision("revision-2", {
      sequence: 2,
      createdAt: t1,
    });
    vi.mocked(store.findReplay).mockResolvedValue({
      revision: persistedRevision,
      event: {
        id: "event-1",
        documentId: "document-1",
        kind: "editorial.revision_created",
        actor: "semogtw-owner",
        revisionId: "revision-2",
        summary: "Editorial revision revision-2 created.",
        reason: null,
        before,
        after,
        occurredAt: t1,
        idempotencyKey: "editorial-key-1",
        correlationId: "editorial-correlation-1",
      },
    });
    vi.mocked(store.findDocument).mockResolvedValue(
      document({
        workingRevisionId: "revision-3",
        version: 3,
        updatedAt: "2026-08-01T23:20:00.000Z",
      }),
    );
    const service = new EditorialWriteService(store);

    await expect(
      service.createRevision(
        {
          documentId: "document-1",
          revisionId: "revision-2",
          title: "SemogSite 2",
          excerpt: "Descrição pública revisada.",
          bodyMarkdown: "# SemogSite\n\nConteúdo público.",
          tags: ["typescript"],
          contentHash: hashB,
        },
        { ...common, expectedUpdatedAt: t0 },
      ),
    ).resolves.toEqual({
      ok: true,
      document: after,
      revision: persistedRevision,
      duplicate: true,
    });
    expect(store.findDocument).not.toHaveBeenCalled();
    expect(store.createRevision).not.toHaveBeenCalled();
  });

  it("rejects reuse of a revision replay identity with changed intent", async () => {
    const store = repository();
    const before = document();
    const after = document({
      workingRevisionId: "revision-2",
      version: 2,
      updatedAt: t1,
    });
    vi.mocked(store.findReplay).mockResolvedValue({
      revision: revision("revision-2", { sequence: 2, createdAt: t1 }),
      event: {
        id: "event-1",
        documentId: "document-1",
        kind: "editorial.revision_created",
        actor: "semogtw-owner",
        revisionId: "revision-2",
        summary: "Editorial revision revision-2 created.",
        reason: null,
        before,
        after,
        occurredAt: t1,
        idempotencyKey: "editorial-key-1",
        correlationId: "editorial-correlation-1",
      },
    });
    const service = new EditorialWriteService(store);

    await expect(
      service.createRevision(
        {
          documentId: "document-1",
          revisionId: "revision-2",
          title: "Intent changed",
          excerpt: "Descrição pública revisada.",
          bodyMarkdown: "# SemogSite\n\nConteúdo público.",
          tags: ["typescript"],
          contentHash: hashB,
        },
        { ...common, expectedUpdatedAt: t0 },
      ),
    ).resolves.toEqual({ ok: false, code: "CONFLICT" });
    expect(store.findDocument).not.toHaveBeenCalled();
  });

  it("creates and persists an approval bound to the working revision/hash", async () => {
    const store = repository();
    vi.mocked(store.findDocument).mockResolvedValue(
      document({ workflowStatus: "in_review" }),
    );
    const service = new EditorialWriteService(store);

    const result = await service.approve(
      {
        documentId: "document-1",
        revisionId: "revision-1",
        approvalId: "approval-1",
        reason: "Revisão completa.",
        notes: null,
        checks: approval().checks,
      },
      { ...common, expectedUpdatedAt: t0 },
    );

    expect(result).toMatchObject({
      ok: true,
      document: {
        workflowStatus: "approved",
        approvedRevisionId: "revision-1",
      },
      approval: {
        id: "approval-1",
        contentHash: hashA,
        reviewerId: "semogtw-owner",
      },
    });
    expect(store.applyTransition).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      expect.objectContaining({ kind: "editorial.approved" }),
      expect.objectContaining({ revisionId: "revision-1", contentHash: hashA }),
    );
  });

  it("publishes only with an exact persisted approval", async () => {
    const store = repository();
    vi.mocked(store.findDocument).mockResolvedValue(
      document({
        workflowStatus: "approved",
        approvedRevisionId: "revision-1",
      }),
    );
    vi.mocked(store.findRevision).mockResolvedValue(revision());
    vi.mocked(store.findApproval).mockResolvedValue(approval());
    const service = new EditorialWriteService(store);

    await expect(
      service.publish(
        { documentId: "document-1", revisionId: "revision-1" },
        { ...common, expectedUpdatedAt: t0 },
      ),
    ).resolves.toMatchObject({
      ok: true,
      document: {
        publicationStatus: "published",
        publishedRevisionId: "revision-1",
      },
    });
    expect(store.findApproval).toHaveBeenCalledWith(
      "document-1",
      "revision-1",
      hashA,
    );
  });

  it("fails closed when publication or rollback approval is absent", async () => {
    const store = repository();
    vi.mocked(store.findDocument).mockResolvedValue(
      document({
        workflowStatus: "approved",
        approvedRevisionId: "revision-1",
      }),
    );
    vi.mocked(store.findApproval).mockResolvedValue(null);
    const service = new EditorialWriteService(store);

    await expect(
      service.publish(
        { documentId: "document-1", revisionId: "revision-1" },
        { ...common, expectedUpdatedAt: t0 },
      ),
    ).resolves.toEqual({ ok: false, code: "APPROVAL_NOT_FOUND" });
    expect(store.applyTransition).not.toHaveBeenCalled();
  });

  it("rolls back to a previous approved revision without replacing the working draft", async () => {
    const store = repository();
    vi.mocked(store.findDocument).mockResolvedValue(
      document({
        workflowStatus: "draft",
        publicationStatus: "published",
        workingRevisionId: "revision-2",
        publishedRevisionId: "revision-2",
        lastPublishedRevisionId: "revision-2",
        version: 6,
      }),
    );
    vi.mocked(store.findRevision).mockResolvedValue(revision("revision-1"));
    vi.mocked(store.findApproval).mockResolvedValue(approval("revision-1"));
    const service = new EditorialWriteService(store);

    await expect(
      service.rollback(
        {
          documentId: "document-1",
          revisionId: "revision-1",
          reason: "Restaurar revisão estável.",
        },
        { ...common, expectedUpdatedAt: t0 },
      ),
    ).resolves.toMatchObject({
      ok: true,
      document: {
        workflowStatus: "draft",
        workingRevisionId: "revision-2",
        publicationStatus: "published",
        publishedRevisionId: "revision-1",
      },
    });
  });

  it("rejects invalid adapter identities before repository access", async () => {
    const store = repository();
    const service = new EditorialWriteService(store);

    await expect(
      service.createDocument(
        {
          documentId: "document-1",
          revisionId: "revision-1",
          kind: "project",
          slug: "semog-site",
          title: "SemogSite",
          excerpt: "Descrição pública revisada.",
          bodyMarkdown: "# SemogSite",
          tags: [],
          contentHash: hashA,
        },
        { ...common, eventId: "bad id", idempotencyKey: "" },
      ),
    ).resolves.toEqual({
      ok: false,
      code: "VALIDATION_FAILED",
      errors: ["EVENT_ID_INVALID", "IDEMPOTENCY_KEY_INVALID"],
    });
    expect(store.createDocument).not.toHaveBeenCalled();
  });
});
