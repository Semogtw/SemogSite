import { describe, expect, it } from "vitest";
import { createDevOSGrowthComposition } from "./devos-growth-composition";

const owner = {
  id: "owner-1",
  sessionId: "session-1",
};

const validQuickCreate = {
  csrfToken: "csrf-token",
  idempotencyKey: "8c8c16cb-7367-4f96-86cf-afbbfbf84122",
  title: "Aprender TypeScript",
  targetDate: null,
  motivation: null,
  templateId: null,
} as const;

function createDependencies(overrides: {
  resolveOwner?: () => Promise<typeof owner | null>;
  authorizeMutation?: (csrfToken: string) => Promise<typeof owner | null>;
  getDatabase?: () => Promise<null>;
} = {}) {
  return {
    resolveOwner: overrides.resolveOwner ?? (async () => owner),
    authorizeMutation:
      overrides.authorizeMutation ?? (async () => owner),
    getDatabase: overrides.getDatabase ?? (async () => null),
    now: () => "2026-08-04T04:50:00.000Z",
    nextId: (prefix: string) => `${prefix}-1`,
    nextCorrelationId: () => "correlation-1",
  };
}

describe("createDevOSGrowthComposition", () => {
  it("fails closed before touching storage when no owner is authenticated", async () => {
    let databaseCalls = 0;
    const handlers = createDevOSGrowthComposition(
      createDependencies({
        resolveOwner: async () => null,
        getDatabase: async () => {
          databaseCalls += 1;
          return null;
        },
      }),
    );

    await expect(handlers.getOverview()).resolves.toEqual({
      ok: false,
      code: "UNAUTHORIZED",
    });
    await expect(handlers.quickCreate(validQuickCreate)).resolves.toEqual({
      ok: false,
      code: "UNAUTHORIZED",
    });
    expect(databaseCalls).toBe(0);
  });

  it("rejects an invalid mutation session before opening storage", async () => {
    let databaseCalls = 0;
    const handlers = createDevOSGrowthComposition(
      createDependencies({
        authorizeMutation: async () => null,
        getDatabase: async () => {
          databaseCalls += 1;
          return null;
        },
      }),
    );

    await expect(handlers.quickCreate(validQuickCreate)).resolves.toEqual({
      ok: false,
      code: "CSRF_INVALID",
    });
    expect(databaseCalls).toBe(0);
  });

  it("maps unavailable private storage to stable read and write errors", async () => {
    let databaseCalls = 0;
    const handlers = createDevOSGrowthComposition(
      createDependencies({
        getDatabase: async () => {
          databaseCalls += 1;
          return null;
        },
      }),
    );

    await expect(handlers.getOverview()).resolves.toEqual({
      ok: false,
      code: "READ_FAILED",
    });
    await expect(handlers.quickCreate(validQuickCreate)).resolves.toEqual({
      ok: false,
      code: "WRITE_FAILED",
    });
    expect(databaseCalls).toBe(2);
  });
});
