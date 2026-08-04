import { describe, expect, it } from "vitest";
import {
  GetGrowthGoalRequestSchema,
  PreviewLearningGoalTemplateRequestSchema,
  QuickCreateLearningGoalRequestSchema,
} from "./devos-growth-server-functions";

describe("Growth server-function schemas", () => {
  it("accepts the bounded quick-create request", () => {
    expect(
      QuickCreateLearningGoalRequestSchema.parse({
        csrfToken: "csrf-token",
        idempotencyKey: "123e4567-e89b-42d3-a456-426614174000",
        title: "Aprender Python",
        targetDate: null,
        motivation: null,
        templateId: "learn_programming_language",
      }),
    ).toEqual({
      csrfToken: "csrf-token",
      idempotencyKey: "123e4567-e89b-42d3-a456-426614174000",
      title: "Aprender Python",
      targetDate: null,
      motivation: null,
      templateId: "learn_programming_language",
    });
  });

  it("rejects unknown fields, malformed UUIDs and unsafe bounds", () => {
    expect(() =>
      QuickCreateLearningGoalRequestSchema.parse({
        csrfToken: "csrf-token",
        idempotencyKey: "not-a-uuid",
        title: "Meta",
        targetDate: null,
        motivation: null,
        templateId: null,
      }),
    ).toThrow();
    expect(() =>
      QuickCreateLearningGoalRequestSchema.parse({
        csrfToken: "csrf-token",
        idempotencyKey: "123e4567-e89b-42d3-a456-426614174000",
        title: "Meta",
        targetDate: null,
        motivation: null,
        templateId: null,
        commandId: "devos_execute_anything",
      }),
    ).toThrow();
  });

  it("accepts only registered deterministic templates", () => {
    expect(
      PreviewLearningGoalTemplateRequestSchema.parse({
        templateId: "earn_credential",
      }),
    ).toEqual({ templateId: "earn_credential" });
    expect(() =>
      PreviewLearningGoalTemplateRequestSchema.parse({
        templateId: "unknown",
      }),
    ).toThrow();
  });

  it("bounds private goal lookup IDs", () => {
    expect(GetGrowthGoalRequestSchema.parse({ goalId: "goal-1" })).toEqual({
      goalId: "goal-1",
    });
    expect(() => GetGrowthGoalRequestSchema.parse({ goalId: "" })).toThrow();
    expect(() =>
      GetGrowthGoalRequestSchema.parse({ goalId: "a".repeat(201) }),
    ).toThrow();
  });
});
