export type StageState =
  | "backlog"
  | "next"
  | "in_progress"
  | "blocked"
  | "completed";

export type EvidenceStatus =
  | "observed"
  | "passed"
  | "failed"
  | "pending"
  | "superseded";

export type StageEvidence = {
  id: string;
  status: EvidenceStatus;
};

export type StageSnapshot = {
  id: string;
  projectId: string;
  title: string;
  state: StageState;
  progress: number;
  done: boolean;
  nextStep: string | null;
  blocker: string | null;
  evidence: readonly StageEvidence[];
  manualLock: boolean;
  updatedAt: string;
};

export type StageValidationError =
  | "BLOCKER_REQUIRED"
  | "NEXT_STEP_REQUIRED"
  | "EVIDENCE_REQUIRED"
  | "PROGRESS_NOT_COMPLETE"
  | "DONE_FLAG_REQUIRED"
  | "PROGRESS_OUT_OF_RANGE"
  | "DONE_FLAG_INCONSISTENT";

export type DomainValidationResult = {
  ok: boolean;
  errors: StageValidationError[];
};

const hasText = (value: string | null): boolean =>
  value !== null && value.trim().length > 0;

const hasValidEvidence = (evidence: readonly StageEvidence[]): boolean =>
  evidence.some((item) => item.status === "observed" || item.status === "passed");

export function validateStage(stage: StageSnapshot): DomainValidationResult {
  const errors: StageValidationError[] = [];

  if (!Number.isInteger(stage.progress) || stage.progress < 0 || stage.progress > 100) {
    errors.push("PROGRESS_OUT_OF_RANGE");
  }

  if (stage.state === "blocked") {
    if (!hasText(stage.blocker)) errors.push("BLOCKER_REQUIRED");
    if (!hasText(stage.nextStep)) errors.push("NEXT_STEP_REQUIRED");
  } else if (stage.state !== "completed" && !hasText(stage.nextStep)) {
    errors.push("NEXT_STEP_REQUIRED");
  }

  if (stage.state === "completed") {
    if (!hasValidEvidence(stage.evidence)) errors.push("EVIDENCE_REQUIRED");
    if (stage.progress !== 100) errors.push("PROGRESS_NOT_COMPLETE");
    if (!stage.done) errors.push("DONE_FLAG_REQUIRED");
  } else if (stage.done) {
    errors.push("DONE_FLAG_INCONSISTENT");
  }

  return { ok: errors.length === 0, errors };
}
