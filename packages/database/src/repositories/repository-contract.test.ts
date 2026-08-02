import { describe, expect, it } from "vitest";
import { createSqliteDatabase, migrate } from "../adapters/sqlite";
import { SqliteAuthSessionStore } from "./auth-session-store";
import { SqliteProjectRepository } from "./project-repository";

const seedProject = {
  id: "project-seed",
  slug: "project-seed",
  name: "Semogtw Platform Demo",
  icon: null,
  status: "active" as const,
  health: "unknown" as const,
  priority: "medium" as const,
  progressEstimate: 10,
  focus: "Validar persistência local",
  nextAction: "Executar contrato do repositório",
  branchSummary: null,
  statusBasis: "Registro demonstrativo",
  confidence: "low" as const,
  visibility: "private" as const,
  publicSummary: null,
  privateSummary: "Dado demonstrativo, não migrado.",
  publicProgress: null,
  featured: false,
  liveUrl: null,
  documentationUrl: null,
  lastActivityAt: null,
  lastSyncedAt: null,
  manualLock: false,
  dataSource: "seed_demo" as const,
  createdAt: "2026-08-01T00:00:00.000Z",
  updatedAt: "2026-08-01T00:00:00.000Z",
};

describe("SqliteProjectRepository", () => {
  it("round-trips visibility and source metadata", async () => {
    const database = createSqliteDatabase(":memory:");
    migrate(database);
    const repository = new SqliteProjectRepository(database);

    await repository.insert(seedProject);

    await expect(repository.findBySlug(seedProject.slug)).resolves.toMatchObject({
      slug: seedProject.slug,
      visibility: "private",
      dataSource: "seed_demo",
    });
  });

  it("orders active projects by semantic priority before name", async () => {
    const database = createSqliteDatabase(":memory:");
    migrate(database);
    const repository = new SqliteProjectRepository(database);

    await repository.insert({
      ...seedProject,
      id: "project-low",
      slug: "project-low",
      name: "A low project",
      priority: "low",
    });
    await repository.insert({
      ...seedProject,
      id: "project-critical",
      slug: "project-critical",
      name: "Z critical project",
      priority: "critical",
    });

    const active = await repository.listActive();
    expect(active[0]?.slug).toBe("project-critical");
    expect(active.at(-1)?.slug).toBe("project-low");
  });
});

describe("SqliteAuthSessionStore", () => {
  it("revokes active sessions when the owner password hash changes", async () => {
    const database = createSqliteDatabase(":memory:");
    migrate(database);
    const store = new SqliteAuthSessionStore(database);
    const now = new Date("2026-08-01T12:00:00.000Z");

    store.upsertOwnerAccount({
      id: "owner",
      displayName: "Semogtw",
      passwordHash: "hash-one",
      now,
    });
    await store.insert({
      id: "session-one",
      ownerId: "owner",
      tokenDigest: "digest-one",
      createdAt: now.toISOString(),
      expiresAt: "2026-08-15T12:00:00.000Z",
      revokedAt: null,
    });

    await expect(
      store.findActiveByTokenDigest("digest-one", now),
    ).resolves.not.toBeNull();

    store.upsertOwnerAccount({
      id: "owner",
      displayName: "Semogtw",
      passwordHash: "hash-two",
      now: new Date("2026-08-01T12:01:00.000Z"),
    });

    await expect(
      store.findActiveByTokenDigest(
        "digest-one",
        new Date("2026-08-01T12:01:00.000Z"),
      ),
    ).resolves.toBeNull();
  });
});
