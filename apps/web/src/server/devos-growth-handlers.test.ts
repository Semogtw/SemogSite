import { describe, expect, it } from "vitest";
import type {
  QuickCreateLearningGoalInput,
  QuickLearningGoalServiceResult,
} from "@semogtw/domain/growth";
import type { GrowthOverviewRead } from "@semogtw/database/growth";
import {
  createDevOSGrowthHandlers,
  type DevOSGrowthDependencies,
} from "./devos-growth-handlers";

const overview: GrowthOverviewRead = {
  activeGoals: [],
  dueCheckpoints: [],
  skillSummaries: [],
  generatedAt: "2026-08-04T04:00:00.000Z",
};

function createHarness(input?: {
  authenticated?: boolean;
  csrfValid?: boolean;
  quickCreateResult?: QuickLearningGoalServiceResult;
}) {
  const calls: string[] = [];
  const dependencies: DevOSGrowthDependencies = {
    async resolveOwner() {
      calls.push("resolveOwner");
      return input?.authenticated === false
        ? null
        : { ownerId: "owner-1", actorId: "owner-1", sessionId: "session-1" };
    },
    async verifyCsrfToken(value) {
      calls.push(`verifyCsrf:${value}`);
      return input?.csrfValid !== false;
    },
    async getOverview(ownerId) {
      calls.push(`getOverview:${ownerId}`);
      return overview;
    },
    async getGoal(ownerId, goalId) {
      calls.push(`getGoal:${ownerId}:${goalId}`);
      return null;
    },
    async createQuickGoal(value: QuickCreateLearningGoalInput, context) {
      calls.push(
        `create:${context.ownerId}:${context.actorId}:${context.idempotencyKey}:${value.title}`,
      );
      return (
        input?.quickCreateResult ?? {
          ok: true,
          replayed: false,
          goal: {
            id: "goal-1",
            ownerId: context.ownerId,
            slug: "aprender-python",
            title: value.title,
            description: "",
            motivation: value.motivation,
            status: "draft",
            priority: "medium",
            targetDate: value.targetDate,
            createdAt: "2026-08-04T04:00:00.000Z",
            updatedAt: "2026-08-04T04:00:00.000Z",
            version: 1,
            checkpoints: [],
            skills: [],
          },
        }
      );
    },
    now() {
      return "2026-08-04T04:00:00.000Z";
    },
    nextCorrelationId() {
      return "correlation-growth-1";
    },
  };

  return {
    handlers: createDevOSGrowthHandlers(dependencies),
    calls,
  };
}

describe("DevOS Growth read handlers", () => {
  it("resolves the owner before reading the private overview", async () => {
    const harness = createHarness();

    await expect(harness.handlers.getOverview()).resolves.toEqual({
      ok: true,
      overview,
    });
    expect(harness.calls).toEqual([
      "resolveOwner",
      "getOverview:owner-1",
    ]);
  });

  it("denies unauthenticated overview before private reads", async () => {
    const harness = createHarness({ authenticated: false });

    await expect(harness.handlers.getOverview()).resolves.toEqual({
      ok: false,
      code: "UNAUTHORIZED",
    });
    expect(harness.calls).toEqual(["resolveOwner"]);
  });

  it("previews a deterministic template only after authentication", async () => {
    const harness = createHarness();

    const result = await harness.handlers.previewTemplate({
      templateId: "learn_programming_language",
    });
    expect(result).toMatchObject({
      ok: true,
      template: {
        templateId: "learn_programming_language",
        templateVersion: 1,
        origin: {
          kind: "template",
          templateId: "learn_programming_language",
          templateVersion: 1,
        },
      },
    });
    if (!result.ok) throw new Error("unexpected preview failure");
    expect(result.template.checkpoints).toHaveLength(5);
    expect(
      result.template.checkpoints.reduce(
        (total, checkpoint) => total + checkpoint.weight,
        0,
      ),
    ).toBe(100);
    expect(harness.calls).toEqual(["resolveOwner"]);
  });

  it("returns a stable template validation error", async () => {
    const harness = createHarness();

    await expect(
      harness.handlers.previewTemplate({
        templateId: "unknown" as "learn_programming_language",
      }),
    ).resolves.toEqual({
      ok: false,
      code: "TEMPLATE_NOT_FOUND",
    });
    expect(harness.calls).toEqual(["resolveOwner"]);
  });
});

describe("DevOS Growth quick-create handler", () => {
  const validRequest = {
    csrfToken: "csrf-token",
    idempotencyKey: "123e4567-e89b-42d3-a456-426614174000",
    title: "Aprender Python",
    targetDate: null,
    motivation: null,
    templateId: null,
  } as const;

  it("checks owner and CSRF before invoking canonical creation", async () => {
    const harness = createHarness();

    await expect(
      harness.handlers.quickCreate(validRequest),
    ).resolves.toMatchObject({
      ok: true,
      replayed: false,
      goal: { id: "goal-1", title: "Aprender Python" },
    });
    expect(harness.calls).toEqual([
      "resolveOwner",
      "verifyCsrf:csrf-token",
      "create:owner-1:owner-1:123e4567-e89b-42d3-a456-426614174000:Aprender Python",
    ]);
  });

  it("denies unauthenticated and invalid-CSRF requests before writes", async () => {
    const unauthenticated = createHarness({ authenticated: false });
    await expect(
      unauthenticated.handlers.quickCreate(validRequest),
    ).resolves.toEqual({ ok: false, code: "UNAUTHORIZED" });
    expect(unauthenticated.calls).toEqual(["resolveOwner"]);

    const invalidCsrf = createHarness({ csrfValid: false });
    await expect(
      invalidCsrf.handlers.quickCreate(validRequest),
    ).resolves.toEqual({ ok: false, code: "CSRF_INVALID" });
    expect(invalidCsrf.calls).toEqual([
      "resolveOwner",
      "verifyCsrf:csrf-token",
    ]);
  });

  it("rejects malformed requests before canonical creation", async () => {
    const harness = createHarness();

    await expect(
      harness.handlers.quickCreate({
        ...validRequest,
        idempotencyKey: "not-a-uuid",
      }),
    ).resolves.toEqual({
      ok: false,
      code: "VALIDATION_FAILED",
      error: "IDEMPOTENCY_KEY_INVALID",
    });
    expect(harness.calls).toEqual(["resolveOwner"]);
  });

  it("maps domain validation and conflict results without raw exceptions", async () => {
    const validation = createHarness({
      quickCreateResult: {
        ok: false,
        code: "VALIDATION_FAILED",
        error: "LEARNING_GOAL_TITLE_REQUIRED",
      },
    });
    await expect(
      validation.handlers.quickCreate(validRequest),
    ).resolves.toEqual({
      ok: false,
      code: "VALIDATION_FAILED",
      error: "LEARNING_GOAL_TITLE_REQUIRED",
    });

    const conflict = createHarness({
      quickCreateResult: { ok: false, code: "CONFLICT" },
    });
    await expect(
      conflict.handlers.quickCreate(validRequest),
    ).resolves.toEqual({ ok: false, code: "CONFLICT" });
  });
});
