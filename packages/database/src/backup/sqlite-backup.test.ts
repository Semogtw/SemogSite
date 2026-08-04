import {
  EditorialRedirectService,
  type EditorialApprovalSnapshot,
  type EditorialDocumentSnapshot,
  type EditorialPersistenceEvent,
  type EditorialRevisionSnapshot,
} from "@semogtw/domain";
import { afterEach, describe, expect, it } from "vitest";
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createSqliteDatabase, migrate } from "../adapters/sqlite";
import { SqliteEditorialReadModel } from "../repositories/editorial-read-model";
import {
  SqliteEditorialRedirectRepository,
} from "../repositories/editorial-redirect-repository";
import { SqliteEditorialWriteRepository } from "../repositories/editorial-write-repository";
import { SqlitePublishedEditorialReadModel } from "../repositories/published-editorial-read-model";
import {
  createVerifiedSqliteBackup,
  verifySqliteBackup,
} from "./sqlite-backup";

const temporaryDirectories: string[] = [];
const expectedMigrations = [
  "0001_foundation.sql",
  "0002_seed_demo.sql",
  "0003_github_observations.sql",
  "0004_github_sync_runs.sql",
  "0005_cooperative_run_ledger.sql",
  "0006_editorial_workflow.sql",
  "0007_editorial_invariant_triggers.sql",
  "0008_editorial_approval_guards.sql",
  "0009_editorial_document_identity_guards.sql",
  "0010_editorial_redirect_registry.sql",
  "0011_scope_reservations.sql",
  "0012_verification_obligations.sql",
  "0013_recovery_snapshots.sql",
  "0015_learning_goals.sql",
  "0015a_learning_checkpoint_weight_modes.sql",
] as const;

function temporaryDirectory(): string {
  const directory = mkdtempSync(join(tmpdir(), "semogtw-backup-"));
  temporaryDirectories.push(directory);
  return directory;
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe("SQLite backup", () => {
  it("creates a verified snapshot with matching migration state", async () => {
    const database = createSqliteDatabase(":memory:");
    migrate(database);
    database.$client
      .prepare("UPDATE projects SET focus = ? WHERE id = ?")
      .run("Estado alterado antes do backup.", "demo-project-platform");
    const destination = join(temporaryDirectory(), "nested", "backup.sqlite");

    const result = await createVerifiedSqliteBackup(database, destination);
    database.$client.close();

    expect(existsSync(destination)).toBe(true);
    expect(result).toMatchObject({
      destination,
      integrity: "ok",
      foreignKeyViolations: 0,
      remainingPages: 0,
      migrations: expectedMigrations,
    });
    expect(result.sizeBytes).toBeGreaterThan(0);

    const verification = verifySqliteBackup(destination, result.migrations);
    expect(verification).toMatchObject({
      destination,
      integrity: "ok",
      foreignKeyViolations: 0,
      migrations: result.migrations,
    });

    const restored = createSqliteDatabase(destination);
    expect(
      restored.$client
        .prepare("SELECT focus FROM projects WHERE id = ?")
        .get("demo-project-platform"),
    ).toEqual({ focus: "Estado alterado antes do backup." });
    restored.$client.close();
  });

  it("restores a published editorial revision without exposing its newer private draft", async () => {
    const database = createSqliteDatabase(":memory:");
    migrate(database);
    const repository = new SqliteEditorialWriteRepository(database);
    const publishedHash = "a".repeat(64);
    const privateHash = "b".repeat(64);
    const createdAt = "2026-08-02T06:00:00.000Z";
    const reviewedAt = "2026-08-02T06:05:00.000Z";
    const publishedAt = "2026-08-02T06:10:00.000Z";
    const redirectedAt = "2026-08-02T06:12:00.000Z";
    const draftedAt = "2026-08-02T06:15:00.000Z";

    const firstRevision: EditorialRevisionSnapshot = {
      id: "revision-public",
      documentId: "document-backup",
      sequence: 1,
      title: "Conteúdo restaurado",
      excerpt: "Revisão pública preservada no snapshot.",
      bodyMarkdown: "# Conteúdo público",
      tags: ["backup"],
      contentHash: publishedHash,
      createdBy: "owner-1",
      createdAt,
    };
    const initial: EditorialDocumentSnapshot = {
      id: "document-backup",
      kind: "note",
      slug: "conteudo-restaurado",
      workflowStatus: "draft",
      publicationStatus: "unpublished",
      workingRevisionId: firstRevision.id,
      approvedRevisionId: null,
      publishedRevisionId: null,
      lastPublishedRevisionId: null,
      version: 1,
      createdAt,
      updatedAt: createdAt,
    };
    const event = (
      kind: EditorialPersistenceEvent["kind"],
      before: EditorialDocumentSnapshot | null,
      after: EditorialDocumentSnapshot,
      revisionId: string | null,
      sequence: number,
      reason: string | null = null,
    ): EditorialPersistenceEvent => ({
      id: `backup-event-${sequence}`,
      documentId: after.id,
      kind,
      actor: "owner-1",
      revisionId,
      summary: kind,
      reason,
      before,
      after,
      occurredAt: after.updatedAt,
      idempotencyKey: `backup-key-${sequence}`,
      correlationId: `backup-correlation-${sequence}`,
    });

    await repository.createDocument(
      initial,
      firstRevision,
      event("editorial.document_created", null, initial, null, 1),
    );
    const approval: EditorialApprovalSnapshot = {
      id: "approval-public",
      documentId: initial.id,
      revisionId: firstRevision.id,
      contentHash: publishedHash,
      reviewerId: "owner-1",
      reason: "Revisão completa para fixture de restauração.",
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
      reviewedAt,
    };
    const approved: EditorialDocumentSnapshot = {
      ...initial,
      workflowStatus: "approved",
      approvedRevisionId: firstRevision.id,
      version: 2,
      updatedAt: reviewedAt,
    };
    await repository.applyTransition(
      initial,
      approved,
      event("editorial.approved", initial, approved, firstRevision.id, 2, approval.reason),
      approval,
    );
    const published: EditorialDocumentSnapshot = {
      ...approved,
      publicationStatus: "published",
      publishedRevisionId: firstRevision.id,
      lastPublishedRevisionId: firstRevision.id,
      version: 3,
      updatedAt: publishedAt,
    };
    await repository.applyTransition(
      approved,
      published,
      event("editorial.published", approved, published, firstRevision.id, 3),
      null,
    );

    const redirectResult = await new EditorialRedirectService(
      new SqliteEditorialRedirectRepository(database),
    ).create(
      {
        sourceSlug: "conteudo-antigo",
        kind: "note",
        targetDocumentId: initial.id,
        reason: "Preservar URL histórica na restauração.",
        confirmed: true,
      },
      {
        actorId: "owner-1",
        eventId: "backup-redirect-event-1",
        idempotencyKey: "backup-redirect-key-1",
        correlationId: "backup-redirect-correlation-1",
        now: redirectedAt,
      },
    );
    expect(redirectResult).toMatchObject({
      ok: true,
      duplicate: false,
      event: { action: "created", sourceSlug: "conteudo-antigo" },
    });

    const privateRevision: EditorialRevisionSnapshot = {
      ...firstRevision,
      id: "revision-private",
      sequence: 2,
      title: "PRIVATE_DRAFT_TITLE",
      excerpt: "PRIVATE_DRAFT_EXCERPT",
      bodyMarkdown: "# PRIVATE_DRAFT_BODY",
      contentHash: privateHash,
      createdAt: draftedAt,
    };
    const draft: EditorialDocumentSnapshot = {
      ...published,
      workflowStatus: "draft",
      workingRevisionId: privateRevision.id,
      approvedRevisionId: null,
      version: 4,
      updatedAt: draftedAt,
    };
    await repository.createRevision(
      published,
      draft,
      privateRevision,
      event("editorial.revision_created", published, draft, privateRevision.id, 4),
    );

    const destination = join(temporaryDirectory(), "editorial-backup.sqlite");
    await createVerifiedSqliteBackup(database, destination);
    database.$client.close();

    const restored = createSqliteDatabase(destination);
    const publicReadModel = new SqlitePublishedEditorialReadModel(restored);
    const publicProjection = await publicReadModel.findBySlug(
      "conteudo-restaurado",
    );
    expect(publicProjection).toMatchObject({
      title: "Conteúdo restaurado",
      bodyMarkdown: "# Conteúdo público",
      publishedRevisionId: firstRevision.id,
    });
    expect(JSON.stringify(publicProjection)).not.toContain("PRIVATE_DRAFT");
    await expect(
      publicReadModel.resolveRedirect("conteudo-antigo", "note"),
    ).resolves.toEqual({ targetSlug: "conteudo-restaurado" });

    const privateDetail = await new SqliteEditorialReadModel(restored).getDocument(
      initial.id,
    );
    expect(privateDetail?.document).toMatchObject({
      workflowStatus: "draft",
      publicationStatus: "published",
      workingRevisionId: privateRevision.id,
      publishedRevisionId: firstRevision.id,
    });
    expect(privateDetail?.revisions.map((revision) => revision.title)).toEqual([
      "PRIVATE_DRAFT_TITLE",
      "Conteúdo restaurado",
    ]);
    expect(privateDetail?.reviews).toHaveLength(1);
    expect(privateDetail?.events).toHaveLength(4);
    expect(privateDetail?.redirects).toEqual([
      expect.objectContaining({
        sourceSlug: "conteudo-antigo",
        action: "created",
        sequence: 1,
      }),
    ]);
    restored.$client.close();
  });

  it("refuses to overwrite an existing destination", async () => {
    const database = createSqliteDatabase(":memory:");
    migrate(database);
    const destination = join(temporaryDirectory(), "backup.sqlite");
    writeFileSync(destination, "sentinel", "utf8");

    await expect(
      createVerifiedSqliteBackup(database, destination),
    ).rejects.toThrow("BACKUP_DESTINATION_EXISTS");
    expect(readFileSync(destination, "utf8")).toBe("sentinel");
    database.$client.close();
  });

  it("rejects a backup whose migration state differs from the expectation", () => {
    const path = join(temporaryDirectory(), "other.sqlite");
    const database = createSqliteDatabase(path);
    migrate(database);
    database.$client
      .prepare("DELETE FROM _semogtw_migrations WHERE name = ?")
      .run("0005_cooperative_run_ledger.sql");
    database.$client.close();

    expect(() => verifySqliteBackup(path, expectedMigrations)).toThrow(
      "BACKUP_MIGRATION_MISMATCH",
    );
  });
});
