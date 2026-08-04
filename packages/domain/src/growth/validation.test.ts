import { describe, expect, it } from "vitest";
import {
  normalizeCheckpointWeight,
  normalizeLearningGoalSlug,
  normalizeLearningGoalTitle,
  normalizeSkillSlug,
  validateCompletionMode,
  validateIsoTimestamp,
  validateLearningCheckpointStatus,
  validateLearningGoalStatus,
  validateSkillStage,
} from "./validation";

describe("Growth validation", () => {
  describe("normalizeLearningGoalTitle", () => {
    it("trims a valid title", () => {
      expect(normalizeLearningGoalTitle("  Aprender Python  ")).toBe(
        "Aprender Python",
      );
    });

    it("rejects empty and overlong titles", () => {
      expect(() => normalizeLearningGoalTitle("   ")).toThrow(
        "LEARNING_GOAL_TITLE_REQUIRED",
      );
      expect(() => normalizeLearningGoalTitle("a".repeat(161))).toThrow(
        "LEARNING_GOAL_TITLE_TOO_LONG",
      );
    });
  });

  describe("normalizeLearningGoalSlug", () => {
    it("normalizes spacing, casing and accents", () => {
      expect(normalizeLearningGoalSlug("  Python Automation ")).toBe(
        "python-automation",
      );
      expect(normalizeLearningGoalSlug("Automação com Café")).toBe(
        "automacao-com-cafe",
      );
    });

    it("rejects slugs without safe content or above the bound", () => {
      expect(() => normalizeLearningGoalSlug("../")).toThrow(
        "LEARNING_GOAL_SLUG_REQUIRED",
      );
      expect(() => normalizeLearningGoalSlug("a".repeat(121))).toThrow(
        "LEARNING_GOAL_SLUG_TOO_LONG",
      );
    });
  });

  describe("normalizeCheckpointWeight", () => {
    it("accepts integer weights from 1 through 100", () => {
      expect(normalizeCheckpointWeight(1)).toBe(1);
      expect(normalizeCheckpointWeight(100)).toBe(100);
    });

    it("rejects non-integers, non-finite values and out-of-range weights", () => {
      expect(() => normalizeCheckpointWeight(0)).toThrow(
        "CHECKPOINT_WEIGHT_OUT_OF_RANGE",
      );
      expect(() => normalizeCheckpointWeight(101)).toThrow(
        "CHECKPOINT_WEIGHT_OUT_OF_RANGE",
      );
      expect(() => normalizeCheckpointWeight(1.5)).toThrow(
        "CHECKPOINT_WEIGHT_MUST_BE_INTEGER",
      );
      expect(() => normalizeCheckpointWeight(Number.NaN)).toThrow(
        "CHECKPOINT_WEIGHT_MUST_BE_FINITE",
      );
    });
  });

  describe("validateCompletionMode", () => {
    it("accepts strict binary and normalized numeric modes", () => {
      expect(validateCompletionMode({ kind: "binary" })).toEqual({
        kind: "binary",
      });
      expect(
        validateCompletionMode({
          kind: "numeric",
          unit: "  horas ",
          target: 20,
        }),
      ).toEqual({ kind: "numeric", unit: "horas", target: 20 });
    });

    it("rejects malformed, unsafe or non-positive numeric modes", () => {
      expect(() => validateCompletionMode(null)).toThrow(
        "CHECKPOINT_COMPLETION_MODE_INVALID",
      );
      expect(() =>
        validateCompletionMode({ kind: "binary", target: 1 }),
      ).toThrow("CHECKPOINT_COMPLETION_MODE_INVALID");
      expect(() =>
        validateCompletionMode({ kind: "numeric", unit: "", target: 1 }),
      ).toThrow("CHECKPOINT_NUMERIC_UNIT_REQUIRED");
      expect(() =>
        validateCompletionMode({
          kind: "numeric",
          unit: "a".repeat(41),
          target: 1,
        }),
      ).toThrow("CHECKPOINT_NUMERIC_UNIT_TOO_LONG");
      expect(() =>
        validateCompletionMode({ kind: "numeric", unit: "horas", target: 0 }),
      ).toThrow("CHECKPOINT_NUMERIC_TARGET_MUST_BE_POSITIVE");
      expect(() =>
        validateCompletionMode({
          kind: "numeric",
          unit: "horas",
          target: Number.POSITIVE_INFINITY,
        }),
      ).toThrow("CHECKPOINT_NUMERIC_TARGET_MUST_BE_FINITE");
    });
  });

  describe("normalizeSkillSlug", () => {
    it("normalizes punctuation into a canonical slug", () => {
      expect(normalizeSkillSlug(" Node.JS ")).toBe("node-js");
    });
  });

  describe("status and timestamp validators", () => {
    it("accepts canonical enum values", () => {
      expect(validateLearningGoalStatus("active")).toBe("active");
      expect(validateLearningCheckpointStatus("in_progress")).toBe(
        "in_progress",
      );
      expect(validateSkillStage("demonstrated")).toBe("demonstrated");
    });

    it("rejects unknown enum values", () => {
      expect(() => validateLearningGoalStatus("done")).toThrow(
        "LEARNING_GOAL_STATUS_INVALID",
      );
      expect(() => validateLearningCheckpointStatus("done")).toThrow(
        "LEARNING_CHECKPOINT_STATUS_INVALID",
      );
      expect(() => validateSkillStage("expert")).toThrow(
        "SKILL_STAGE_INVALID",
      );
    });

    it("accepts only canonical UTC ISO timestamps", () => {
      expect(validateIsoTimestamp("2026-08-04T00:24:00.000Z")).toBe(
        "2026-08-04T00:24:00.000Z",
      );
      expect(() => validateIsoTimestamp("2026-08-04")).toThrow(
        "ISO_TIMESTAMP_INVALID",
      );
      expect(() => validateIsoTimestamp("2026-08-04T00:24:00+00:00")).toThrow(
        "ISO_TIMESTAMP_INVALID",
      );
    });
  });
});
