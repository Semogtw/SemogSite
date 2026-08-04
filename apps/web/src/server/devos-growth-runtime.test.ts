import { afterEach, describe, expect, it } from "vitest";
import { createSqliteDatabase, migrate } from "@semogtw/database";
import { createDevOSGrowthRuntime } from "./devos-growth-runtime";

const databases: ReturnType<typeof createSqliteDatabase>[] = [];

afterEach(() => {
  for (const database of databases.splice(0)) database.$client.close();
});

describe("createDevOSGrowthRuntime", () => {
  it("composes private reads and atomic quick creation on one database", async () => {
    const database = createSqliteDatabase(":memory:");
    databases.push(database);
    migrate(database);
    let id = 0;
    const runtime = createDevOSGrowthRuntime({
      database,
      async resolveOwner() {
        return {
          ownerId: "owner-1",
          actorId: "owner-1",
          sessionId: "session-1",
        };
      },
      async verifyCsrfToken(value) {
        return value === "csrf-token";
      },
      now: () => "2026-08-04T05:00:00.000Z",
      nextId: (prefix) => `${prefix}-${++id}`,
      nextCorrelationId: () => "correlation-growth-1",
    });

    await expect(runtime.handlers.getOverview()).resolves.toEqual({
      ok: true,
      overview: {
        activeGoals: [],
        dueCheckpoints: [],
        skillSummaries: [],
        generatedAt: "2026-08-04T05:00:00.000Z",
      },
    });

    await expect(
      runtime.handlers.quickCreate({
        csrfToken: "csrf-token",
        idempotencyKey: "123e4567-e89b-42d3-a456-426614174000",
        title: "Aprender Python para automação",
        targetDate: null,
        motivation: "Criar ferramentas",
        templateId: "learn_programming_language",
      }),
    ).resolves.toMatchObject({
      ok: true,
      replayed: false,
      goal: {
        ownerId: "owner-1",
        title: "Aprender Python para automação",
        checkpoints: expect.arrayContaining([expect.any(Object)]),
      },
    });

    const overview = await runtime.handlers.getOverview();
    expect(overview).toMatchObject({
      ok: true,
      overview: {
        activeGoals: [],
      },
    });
    if (!overview.ok) throw new Error("unexpected overview failure");
    expect(
      database.$client
        .prepare(
          "SELECT owner_id, status, COUNT(*) AS count FROM learning_goals GROUP BY owner_id, status",
        )
        .all(),
    ).toEqual([{ owner_id: "owner-1", status: "draft", count: 1 }]);
    expect(
      database.$client
        .prepare("SELECT COUNT(*) AS count FROM learning_checkpoints")
        .get(),
    ).toEqual({ count: 5 });
  });

  it("does not access the database when owner resolution fails", async () => {
    const database = createSqliteDatabase(":memory:");
    databases.push(database);
    migrate(database);
    const runtime = createDevOSGrowthRuntime({
      database,
      async resolveOwner() {
        return null;
      },
      async verifyCsrfToken() {
        throw new Error("CSRF_SHOULD_NOT_RUN");
      },
      now: () => "2026-08-04T05:00:00.000Z",
      nextId: (prefix) => `${prefix}-1`,
      nextCorrelationId: () => "correlation-growth-1",
    });

    await expect(runtime.handlers.getOverview()).resolves.toEqual({
      ok: false,
      code: "UNAUTHORIZED",
    });
    await expect(
      runtime.handlers.quickCreate({
        csrfToken: "csrf-token",
        idempotencyKey: "123e4567-e89b-42d3-a456-426614174000",
        title: "Meta",
        targetDate: null,
        motivation: null,
        templateId: null,
      }),
    ).resolves.toEqual({ ok: false, code: "UNAUTHORIZED" });
    expect(
      database.$client
        .prepare("SELECT COUNT(*) AS count FROM learning_goals")
        .get(),
    ).toEqual({ count: 0 });
  });
});
