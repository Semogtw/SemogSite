import { describe, expect, it } from "vitest";
import { validateStage } from "./stage";

const baseStage = {
  projectId: "project-1",
  title: "Validar fundação",
  progress: 40,
  done: false,
  nextStep: "Executar o próximo gate",
  blocker: null,
  evidence: [],
  manualLock: false,
  updatedAt: "2026-08-01T00:00:00.000Z",
} as const;

describe("validateStage", () => {
  it("rejects completion without valid evidence", () => {
    const result = validateStage({
      ...baseStage,
      id: "stage-1",
      state: "completed",
      progress: 100,
      done: true,
      nextStep: null,
    });

    expect(result).toEqual({
      ok: false,
      errors: ["EVIDENCE_REQUIRED"],
    });
  });

  it("rejects blocked stages without a blocker and unlock action", () => {
    const result = validateStage({
      ...baseStage,
      id: "stage-2",
      state: "blocked",
      nextStep: "",
      blocker: "",
    });

    expect(result).toEqual({
      ok: false,
      errors: ["BLOCKER_REQUIRED", "NEXT_STEP_REQUIRED"],
    });
  });

  it("rejects completed stages whose progress or done flag is inconsistent", () => {
    const result = validateStage({
      ...baseStage,
      id: "stage-3",
      state: "completed",
      progress: 90,
      done: false,
      nextStep: null,
      evidence: [{ id: "evidence-1", status: "passed" }],
    });

    expect(result).toEqual({
      ok: false,
      errors: ["PROGRESS_NOT_COMPLETE", "DONE_FLAG_REQUIRED"],
    });
  });

  it("accepts observed or passed evidence for a consistent completion", () => {
    const result = validateStage({
      ...baseStage,
      id: "stage-4",
      state: "completed",
      progress: 100,
      done: true,
      nextStep: null,
      evidence: [{ id: "evidence-1", status: "observed" }],
    });

    expect(result).toEqual({ ok: true, errors: [] });
  });
});
