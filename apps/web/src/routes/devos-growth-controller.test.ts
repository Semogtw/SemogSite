import { describe, expect, it, vi } from "vitest";
import type {
  MaterializedLearningGoalTemplate,
  QuickLearningGoalServiceResult,
} from "@semogtw/domain/growth";
import type { GrowthOverviewRead } from "@semogtw/database/growth";
import { createDevOSGrowthController } from "./devos-growth-controller";

const overview: GrowthOverviewRead = {
  activeGoals: [],
  dueCheckpoints: [],
  skillSummaries: [],
  generatedAt: "2026-08-04T06:00:00.000Z",
};

const template: MaterializedLearningGoalTemplate = {
  templateId: "learn_programming_language",
  templateVersion: 1,
  label: "Aprender uma linguagem de programação",
  description: "",
  origin: {
    kind: "template",
    templateId: "learn_programming_language",
    templateVersion: 1,
  },
  checkpoints: [
    {
      key: "fundamentals",
      title: "Fundamentos",
      description: "",
      required: true,
      completionMode: { kind: "binary" },
      weight: 100,
      weightMode: "automatic",
    },
  ],
};

function successGoal(): Extract<QuickLearningGoalServiceResult, { ok: true }> {
  return {
    ok: true,
    replayed: false,
    goal: {
      id: "goal-1",
      ownerId: "owner-1",
      slug: "meta",
      title: "Meta",
      description: "",
      motivation: null,
      status: "draft",
      priority: "medium",
      targetDate: null,
      createdAt: "2026-08-04T06:00:00.000Z",
      updatedAt: "2026-08-04T06:00:00.000Z",
      version: 1,
      checkpoints: [],
      skills: [],
    },
  };
}

describe("createDevOSGrowthController", () => {
  it("loads a private overview and rejects failed reads with stable route errors", async () => {
    const controller = createDevOSGrowthController({
      getOverview: vi.fn(async () => ({ ok: true as const, overview })),
      previewTemplate: vi.fn(),
      quickCreate: vi.fn(),
      invalidate: vi.fn(),
    });
    await expect(controller.load()).resolves.toEqual({ overview });

    const unauthorized = createDevOSGrowthController({
      getOverview: vi.fn(async () => ({ ok: false as const, code: "UNAUTHORIZED" as const })),
      previewTemplate: vi.fn(),
      quickCreate: vi.fn(),
      invalidate: vi.fn(),
    });
    await expect(unauthorized.load()).rejects.toThrow("GROWTH_ROUTE_UNAUTHORIZED");
  });

  it("returns only the deterministic template payload", async () => {
    const controller = createDevOSGrowthController({
      getOverview: vi.fn(),
      previewTemplate: vi.fn(async () => ({ ok: true as const, template })),
      quickCreate: vi.fn(),
      invalidate: vi.fn(),
    });

    await expect(
      controller.previewTemplate("learn_programming_language"),
    ).resolves.toEqual(template);
  });

  it("maps a successful aggregate to UI result and invalidates private data", async () => {
    const invalidate = vi.fn(async () => undefined);
    const controller = createDevOSGrowthController({
      getOverview: vi.fn(),
      previewTemplate: vi.fn(),
      quickCreate: vi.fn(async () => successGoal()),
      invalidate,
    });

    await expect(
      controller.quickCreate({
        csrfToken: "csrf-token",
        idempotencyKey: "123e4567-e89b-42d3-a456-426614174000",
        title: "Meta",
        targetDate: null,
        motivation: null,
        templateId: null,
      }),
    ).resolves.toEqual({ ok: true, goalId: "goal-1", replayed: false });
    expect(invalidate).toHaveBeenCalledTimes(1);
  });

  it("preserves stable mutation failures and does not invalidate", async () => {
    const invalidate = vi.fn(async () => undefined);
    const controller = createDevOSGrowthController({
      getOverview: vi.fn(),
      previewTemplate: vi.fn(),
      quickCreate: vi.fn(async () => ({ ok: false as const, code: "CONFLICT" as const })),
      invalidate,
    });

    await expect(
      controller.quickCreate({
        csrfToken: "csrf-token",
        idempotencyKey: "123e4567-e89b-42d3-a456-426614174000",
        title: "Meta",
        targetDate: null,
        motivation: null,
        templateId: null,
      }),
    ).resolves.toEqual({ ok: false, code: "CONFLICT" });
    expect(invalidate).not.toHaveBeenCalled();
  });
});
