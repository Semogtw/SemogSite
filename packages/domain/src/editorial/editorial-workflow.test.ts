import { describe, expect, it } from "vitest";
import {
  applyEditorialTransition,
  createEditorialDocument,
  createEditorialRevision,
  projectPublishedEditorialDocument,
  type EditorialApprovalSnapshot,
  type EditorialDocumentSnapshot,
  type EditorialRevisionSnapshot,
} from "./editorial-workflow";

const now = "2026-08-01T23:00:00.000Z";
const later = "2026-08-01T23:10:00.000Z";
const hashA = "a".repeat(64);
const hashB = "b".repeat(64);

function revision(
  id = "revision-1",
  contentHash = hashA,
): EditorialRevisionSnapshot {
  return {
    id,
    documentId: "document-1",
    sequence: id === "revision-1" ? 1 : 2,
    title: id === "revision-1" ? "SemogSite" : "SemogSite atualizado",
    excerpt: "Uma plataforma editorial e operacional privada.",
    bodyMarkdown: "# SemogSite\n\nConteúdo público revisado.",
    tags: ["typescript", "devos"],
    contentHash,
    createdBy: "semogtw-owner",
    createdAt: now,
  };
}

function document(): EditorialDocumentSnapshot {
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
    createdAt: now,
    updatedAt: now,
  };
}

function approval(
  revisionId = "revision-1",
  contentHash = hashA,
): EditorialApprovalSnapshot {
  return {
    id: `approval-${revisionId}`,
    documentId: "document-1",
    revisionId,
    contentHash,
    reviewerId: "semogtw-owner",
    reason: "Conteúdo revisado para publicação.",
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
    reviewedAt: later,
  };
}

function context(expectedUpdatedAt = now) {
  return {
    actorId: "semogtw-owner",
    eventId: "editorial-event-1",
    idempotencyKey: "editorial-key-1",
    correlationId: "editorial-correlation-1",
    expectedUpdatedAt,
    now: later,
  } as const;
}

describe("editorial draft creation", () => {
  it("creates a private document and normalized immutable first revision", () => {
    const result = createEditorialDocument(
      {
        id: " document-1 ",
        revisionId: " revision-1 ",
        kind: "project",
        slug: " Semog-Site ",
        title: " SemogSite ",
        excerpt: " Uma plataforma editorial e operacional privada. ",
        bodyMarkdown: "# SemogSite\n\nConteúdo público revisado.",
        tags: [" TypeScript ", "devos", "typescript"],
        contentHash: hashA,
      },
      {
        actorId: "semogtw-owner",
        now,
      },
    );

    expect(result).toEqual({
      ok: true,
      document: document(),
      revision: revision(),
    });
  });

  it.each([
    ["raw HTML", { bodyMarkdown: "# Title\n<script>alert(1)</script>" }],
    ["invalid slug", { slug: "bad slug" }],
    ["empty title", { title: "   " }],
    ["too many tags", { tags: Array.from({ length: 13 }, (_, index) => `tag-${index}`) }],
    ["invalid content hash", { contentHash: "not-a-hash" }],
  ])("rejects %s before producing a revision", (_name, change) => {
    const result = createEditorialDocument(
      {
        id: "document-1",
        revisionId: "revision-1",
        kind: "project",
        slug: "semog-site",
        title: "SemogSite",
        excerpt: "Uma plataforma editorial.",
        bodyMarkdown: "# SemogSite",
        tags: ["typescript"],
        contentHash: hashA,
        ...change,
      },
      { actorId: "semogtw-owner", now },
    );

    expect(result).toMatchObject({ ok: false, code: "VALIDATION_FAILED" });
  });

  it("creates a new private working revision without replacing published content", () => {
    const published = {
      ...document(),
      workflowStatus: "approved" as const,
      publicationStatus: "published" as const,
      approvedRevisionId: "revision-1",
      publishedRevisionId: "revision-1",
      lastPublishedRevisionId: "revision-1",
    };

    const result = createEditorialRevision(
      published,
      {
        revisionId: "revision-2",
        title: "SemogSite atualizado",
        excerpt: "Uma plataforma editorial e operacional privada.",
        bodyMarkdown: "# SemogSite\n\nConteúdo público revisado.",
        tags: ["typescript", "devos"],
        contentHash: hashB,
      },
      {
        actorId: "semogtw-owner",
        expectedUpdatedAt: now,
        now: later,
      },
    );

    expect(result).toEqual({
      ok: true,
      document: {
        ...published,
        workflowStatus: "draft",
        workingRevisionId: "revision-2",
        approvedRevisionId: null,
        version: 2,
        updatedAt: later,
      },
      revision: {
        ...revision("revision-2", hashB),
        createdAt: later,
      },
    });
    expect(result.ok && result.document.publishedRevisionId).toBe("revision-1");
  });
});

describe("editorial lifecycle", () => {
  it("submits, approves and publishes the exact reviewed revision", () => {
    const submitted = applyEditorialTransition(
      document(),
      { kind: "submit_for_review", revision: revision() },
      context(),
    );
    expect(submitted).toMatchObject({
      ok: true,
      document: { workflowStatus: "in_review", version: 2 },
      event: { kind: "editorial.submitted_for_review" },
    });
    if (!submitted.ok) throw new Error("expected submit success");

    const approved = applyEditorialTransition(
      submitted.document,
      { kind: "approve", revision: revision(), approval: approval() },
      { ...context(later), now: "2026-08-01T23:20:00.000Z" },
    );
    expect(approved).toMatchObject({
      ok: true,
      document: {
        workflowStatus: "approved",
        approvedRevisionId: "revision-1",
      },
      event: { kind: "editorial.approved" },
    });
    if (!approved.ok) throw new Error("expected approval success");

    const published = applyEditorialTransition(
      approved.document,
      { kind: "publish", revision: revision(), approval: approval() },
      {
        ...context(approved.document.updatedAt),
        now: "2026-08-01T23:30:00.000Z",
      },
    );
    expect(published).toMatchObject({
      ok: true,
      document: {
        workflowStatus: "approved",
        publicationStatus: "published",
        publishedRevisionId: "revision-1",
        lastPublishedRevisionId: "revision-1",
      },
      event: { kind: "editorial.published" },
    });
  });

  it("requires every sensitive review check and matching content hash", () => {
    const inReview = { ...document(), workflowStatus: "in_review" as const };
    const incomplete = approval();
    incomplete.checks.credentials = false;

    expect(
      applyEditorialTransition(
        inReview,
        { kind: "approve", revision: revision(), approval: incomplete },
        context(),
      ),
    ).toEqual({
      ok: false,
      code: "VALIDATION_FAILED",
      errors: ["REVIEW_CHECKS_INCOMPLETE"],
    });

    expect(
      applyEditorialTransition(
        inReview,
        {
          kind: "approve",
          revision: revision(),
          approval: approval("revision-1", hashB),
        },
        context(),
      ),
    ).toEqual({
      ok: false,
      code: "VALIDATION_FAILED",
      errors: ["APPROVAL_CONTENT_HASH_MISMATCH"],
    });
  });

  it("withdraws without deleting the last published revision", () => {
    const published = {
      ...document(),
      workflowStatus: "approved" as const,
      publicationStatus: "published" as const,
      approvedRevisionId: "revision-1",
      publishedRevisionId: "revision-1",
      lastPublishedRevisionId: "revision-1",
    };

    const result = applyEditorialTransition(
      published,
      { kind: "withdraw", reason: "Correção editorial necessária." },
      context(),
    );

    expect(result).toMatchObject({
      ok: true,
      document: {
        publicationStatus: "withdrawn",
        publishedRevisionId: null,
        lastPublishedRevisionId: "revision-1",
      },
      event: { kind: "editorial.withdrawn" },
    });
  });

  it("rolls back by publishing a previous approved revision as a new event", () => {
    const current = {
      ...document(),
      workflowStatus: "draft" as const,
      publicationStatus: "published" as const,
      workingRevisionId: "revision-2",
      publishedRevisionId: "revision-2",
      lastPublishedRevisionId: "revision-2",
      version: 4,
    };

    const result = applyEditorialTransition(
      current,
      {
        kind: "rollback",
        revision: revision("revision-1", hashA),
        approval: approval("revision-1", hashA),
        reason: "Restaurar a revisão estável anterior.",
      },
      context(),
    );

    expect(result).toMatchObject({
      ok: true,
      document: {
        workflowStatus: "draft",
        workingRevisionId: "revision-2",
        publicationStatus: "published",
        publishedRevisionId: "revision-1",
        lastPublishedRevisionId: "revision-1",
        version: 5,
      },
      event: { kind: "editorial.rolled_back" },
    });
  });

  it("rejects stale state, wrong revision and invalid lifecycle transitions", () => {
    expect(
      applyEditorialTransition(
        document(),
        { kind: "submit_for_review", revision: revision() },
        context("2026-08-01T22:00:00.000Z"),
      ),
    ).toEqual({ ok: false, code: "STALE_STATE" });

    expect(
      applyEditorialTransition(
        document(),
        { kind: "submit_for_review", revision: revision("revision-2", hashB) },
        context(),
      ),
    ).toEqual({
      ok: false,
      code: "VALIDATION_FAILED",
      errors: ["WORKING_REVISION_MISMATCH"],
    });

    expect(
      applyEditorialTransition(
        document(),
        { kind: "publish", revision: revision(), approval: approval() },
        context(),
      ),
    ).toEqual({ ok: false, code: "INVALID_TRANSITION" });
  });
});

describe("public editorial projection", () => {
  it("projects only allowlisted fields from the exact published revision", () => {
    const published = {
      ...document(),
      workflowStatus: "draft" as const,
      publicationStatus: "published" as const,
      workingRevisionId: "revision-2",
      publishedRevisionId: "revision-1",
      lastPublishedRevisionId: "revision-1",
    };

    expect(projectPublishedEditorialDocument(published, revision())).toEqual({
      kind: "project",
      slug: "semog-site",
      title: "SemogSite",
      excerpt: "Uma plataforma editorial e operacional privada.",
      bodyMarkdown: "# SemogSite\n\nConteúdo público revisado.",
      tags: ["typescript", "devos"],
      contentHash: hashA,
      publishedRevisionId: "revision-1",
      updatedAt: now,
    });
  });

  it("returns null for draft/withdrawn content or a nonpublished revision", () => {
    expect(projectPublishedEditorialDocument(document(), revision())).toBeNull();
    expect(
      projectPublishedEditorialDocument(
        {
          ...document(),
          publicationStatus: "withdrawn",
          lastPublishedRevisionId: "revision-1",
        },
        revision(),
      ),
    ).toBeNull();
    expect(
      projectPublishedEditorialDocument(
        {
          ...document(),
          publicationStatus: "published",
          publishedRevisionId: "revision-1",
          lastPublishedRevisionId: "revision-1",
        },
        revision("revision-2", hashB),
      ),
    ).toBeNull();
  });
});
