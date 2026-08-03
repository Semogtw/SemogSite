import {
  normalizeScopePatterns,
  scopeReservationsOverlap,
  type ScopeReservationKind,
  type ScopeReservationSnapshot,
} from "./scope-reservation";

export type SafeWorkPriority = "critical" | "high" | "medium" | "low";
export type SafeWorkState = "backlog" | "next" | "in_progress" | "blocked";
export type SafeWorkRisk = "low" | "medium" | "high";
export type SafeWorkConfidence = "high" | "medium" | "low";

export type SafeWorkCandidate = {
  id: string;
  projectId: string;
  repositoryId: string;
  stageId: string;
  title: string;
  branch: string;
  scopePatterns: readonly string[];
  priority: SafeWorkPriority;
  state: SafeWorkState;
  dependencies: readonly {
    id: string;
    status: "pending" | "completed" | "waived";
  }[];
  requiredCapabilities: readonly string[];
  ownerDecisionRequired: boolean;
  estimatedMinutes: number;
  risk: SafeWorkRisk;
  confidence: SafeWorkConfidence;
  sourceObservedAt: string;
};

export type SafeWorkVerification = {
  id: string;
  stageId: string | null;
  status: string;
  gateName: string;
  requiredBeforeWork: boolean;
};

export type SafeWorkEvaluationInput = {
  observedAt: string;
  availableCapabilities: readonly string[];
  candidates: readonly SafeWorkCandidate[];
  reservations: readonly ScopeReservationSnapshot[];
  verificationObligations: readonly SafeWorkVerification[];
};

export type SafeWorkRecommendationReason =
  | "PRIORITY_CRITICAL"
  | "PRIORITY_HIGH"
  | "PRIORITY_MEDIUM"
  | "PRIORITY_LOW"
  | "ALREADY_IN_PROGRESS"
  | "READY_NEXT"
  | "BACKLOG_AVAILABLE"
  | "CAPABILITIES_AVAILABLE"
  | "NO_SCOPE_CONFLICT"
  | "DEPENDENCIES_COMPLETE"
  | "SOURCE_CONFIDENCE_HIGH"
  | "SOURCE_CONFIDENCE_MEDIUM"
  | "LOW_RISK"
  | "BOUNDED_UNIT";

export type SafeWorkExclusionCode =
  | "CANDIDATE_INVALID"
  | "SOURCE_DATA_STALE"
  | "STAGE_BLOCKED"
  | "DEPENDENCY_INCOMPLETE"
  | "OWNER_DECISION_REQUIRED"
  | "CAPABILITY_MISSING"
  | "SCOPE_RESERVED"
  | "PREREQUISITE_GATE_UNRESOLVED";

export type SafeWorkRecommendation = {
  candidateId: string;
  title: string;
  score: number;
  reasons: readonly SafeWorkRecommendationReason[];
  sourceObservedAt: string;
};

export type SafeWorkExclusion = {
  candidateId: string;
  codes: readonly SafeWorkExclusionCode[];
  details: readonly string[];
};

export type SafeWorkEvaluationError = "OBSERVED_AT_INVALID";

export type SafeWorkEvaluationResult =
  | {
      ok: true;
      observedAt: string;
      recommendations: readonly SafeWorkRecommendation[];
      exclusions: readonly SafeWorkExclusion[];
    }
  | {
      ok: false;
      code: "VALIDATION_FAILED";
      errors: readonly SafeWorkEvaluationError[];
      observedAt: null;
      recommendations: readonly [];
      exclusions: readonly [];
    };

const priorities = new Set<SafeWorkPriority>([
  "critical",
  "high",
  "medium",
  "low",
]);
const states = new Set<SafeWorkState>([
  "backlog",
  "next",
  "in_progress",
  "blocked",
]);
const risks = new Set<SafeWorkRisk>(["low", "medium", "high"]);
const confidences = new Set<SafeWorkConfidence>(["high", "medium", "low"]);
const priorityScore: Record<SafeWorkPriority, number> = {
  critical: 400,
  high: 300,
  medium: 200,
  low: 100,
};
const stateScore: Record<SafeWorkState, number> = {
  in_progress: 40,
  next: 30,
  backlog: 10,
  blocked: 0,
};
const riskScore: Record<SafeWorkRisk, number> = {
  low: 20,
  medium: 10,
  high: 0,
};
const confidenceScore: Record<SafeWorkConfidence, number> = {
  high: 20,
  medium: 10,
  low: 0,
};
const resolvedVerificationStatuses = new Set([
  "passed",
  "waived",
  "superseded",
]);
const maximumSourceAgeMilliseconds = 24 * 60 * 60 * 1_000;

function text(value: string | null | undefined): string {
  return value?.trim() ?? "";
}

function normalizeIso(value: string): string | null {
  const epoch = Date.parse(value);
  return Number.isNaN(epoch) ? null : new Date(epoch).toISOString();
}

function normalizedValues(values: readonly string[]): readonly string[] {
  return [...new Set(values.map((value) => value.trim().toLowerCase()).filter(Boolean))]
    .sort((left, right) => left.localeCompare(right));
}

function scopeKind(patterns: readonly string[]): ScopeReservationKind {
  if (patterns.includes("**")) return "repository";
  return patterns.every((pattern) => pattern.endsWith("/**"))
    ? "directory"
    : "files";
}

function candidateAsReservation(
  candidate: SafeWorkCandidate,
  observedAt: string,
): ScopeReservationSnapshot {
  return {
    id: `candidate-${candidate.id}`,
    projectId: candidate.projectId,
    repositoryId: candidate.repositoryId,
    runId: null,
    branch: candidate.branch,
    kind: scopeKind(candidate.scopePatterns),
    patterns: candidate.scopePatterns,
    holderLabel: "safe-work-evaluator",
    purpose: candidate.title,
    state: "active",
    acquiredAt: observedAt,
    renewedAt: observedAt,
    expiresAt: new Date(Date.parse(observedAt) + 60_000).toISOString(),
    releasedAt: null,
    version: 1,
  };
}

function candidateValid(candidate: SafeWorkCandidate): boolean {
  const sourceObservedAt = normalizeIso(candidate.sourceObservedAt);
  const normalizedScope = normalizeScopePatterns(candidate.scopePatterns);
  return (
    text(candidate.id).length > 0 &&
    text(candidate.projectId).length > 0 &&
    text(candidate.repositoryId).length > 0 &&
    text(candidate.stageId).length > 0 &&
    text(candidate.title).length > 0 &&
    text(candidate.branch).length > 0 &&
    normalizedScope.ok &&
    priorities.has(candidate.priority) &&
    states.has(candidate.state) &&
    risks.has(candidate.risk) &&
    confidences.has(candidate.confidence) &&
    Number.isInteger(candidate.estimatedMinutes) &&
    candidate.estimatedMinutes > 0 &&
    candidate.estimatedMinutes <= 8 * 60 &&
    sourceObservedAt !== null
  );
}

function priorityReason(
  priority: SafeWorkPriority,
): SafeWorkRecommendationReason {
  if (priority === "critical") return "PRIORITY_CRITICAL";
  if (priority === "high") return "PRIORITY_HIGH";
  if (priority === "medium") return "PRIORITY_MEDIUM";
  return "PRIORITY_LOW";
}

function stateReason(state: SafeWorkState): SafeWorkRecommendationReason {
  if (state === "in_progress") return "ALREADY_IN_PROGRESS";
  if (state === "next") return "READY_NEXT";
  return "BACKLOG_AVAILABLE";
}

function sizeScore(minutes: number): number {
  if (minutes <= 30) return 20;
  if (minutes <= 60) return 10;
  if (minutes <= 120) return 5;
  return 0;
}

export class SafeWorkService {
  evaluate(input: SafeWorkEvaluationInput): SafeWorkEvaluationResult {
    const observedAt = normalizeIso(input.observedAt);
    if (observedAt === null) {
      return {
        ok: false,
        code: "VALIDATION_FAILED",
        errors: ["OBSERVED_AT_INVALID"],
        observedAt: null,
        recommendations: [],
        exclusions: [],
      };
    }

    const capabilities = new Set(normalizedValues(input.availableCapabilities));
    const recommendations: SafeWorkRecommendation[] = [];
    const exclusions: SafeWorkExclusion[] = [];

    for (const candidate of [...input.candidates].sort((left, right) =>
      left.id.localeCompare(right.id),
    )) {
      const codes: SafeWorkExclusionCode[] = [];
      const details = new Set<string>();

      if (!candidateValid(candidate)) {
        codes.push("CANDIDATE_INVALID");
      } else {
        const sourceObservedAt = normalizeIso(candidate.sourceObservedAt);
        if (
          sourceObservedAt === null ||
          Date.parse(observedAt) - Date.parse(sourceObservedAt) >
            maximumSourceAgeMilliseconds ||
          Date.parse(sourceObservedAt) > Date.parse(observedAt)
        ) {
          codes.push("SOURCE_DATA_STALE");
        }
      }

      if (candidate.state === "blocked") codes.push("STAGE_BLOCKED");

      const incompleteDependencies = candidate.dependencies
        .filter((dependency) =>
          dependency.status !== "completed" && dependency.status !== "waived",
        )
        .map((dependency) => dependency.id)
        .sort((left, right) => left.localeCompare(right));
      if (incompleteDependencies.length > 0) {
        codes.push("DEPENDENCY_INCOMPLETE");
        incompleteDependencies.forEach((id) => details.add(id));
      }

      if (candidate.ownerDecisionRequired) {
        codes.push("OWNER_DECISION_REQUIRED");
      }

      const missingCapabilities = normalizedValues(candidate.requiredCapabilities)
        .filter((capability) => !capabilities.has(capability));
      if (missingCapabilities.length > 0) {
        codes.push("CAPABILITY_MISSING");
        missingCapabilities.forEach((capability) => details.add(capability));
      }

      if (candidateValid(candidate)) {
        const syntheticReservation = candidateAsReservation(candidate, observedAt);
        const overlappingReservations = input.reservations
          .filter((reservation) =>
            scopeReservationsOverlap(
              syntheticReservation,
              reservation,
              observedAt,
            ).overlaps,
          )
          .map((reservation) => reservation.id)
          .sort((left, right) => left.localeCompare(right));
        if (overlappingReservations.length > 0) {
          codes.push("SCOPE_RESERVED");
          overlappingReservations.forEach((id) => details.add(id));
        }
      }

      const unresolvedPrerequisites = input.verificationObligations
        .filter(
          (obligation) =>
            obligation.stageId === candidate.stageId &&
            obligation.requiredBeforeWork &&
            !resolvedVerificationStatuses.has(obligation.status),
        )
        .map((obligation) => obligation.id)
        .sort((left, right) => left.localeCompare(right));
      if (unresolvedPrerequisites.length > 0) {
        codes.push("PREREQUISITE_GATE_UNRESOLVED");
        unresolvedPrerequisites.forEach((id) => details.add(id));
      }

      if (codes.length > 0) {
        exclusions.push({
          candidateId: candidate.id,
          codes: [...new Set(codes)],
          details: [...details].sort((left, right) => left.localeCompare(right)),
        });
        continue;
      }

      const reasons: SafeWorkRecommendationReason[] = [
        priorityReason(candidate.priority),
        stateReason(candidate.state),
        "CAPABILITIES_AVAILABLE",
        "NO_SCOPE_CONFLICT",
        "DEPENDENCIES_COMPLETE",
      ];
      if (candidate.confidence === "high") {
        reasons.push("SOURCE_CONFIDENCE_HIGH");
      } else if (candidate.confidence === "medium") {
        reasons.push("SOURCE_CONFIDENCE_MEDIUM");
      }
      if (candidate.risk === "low") reasons.push("LOW_RISK");
      if (candidate.estimatedMinutes <= 120) reasons.push("BOUNDED_UNIT");

      recommendations.push({
        candidateId: candidate.id,
        title: candidate.title,
        score:
          priorityScore[candidate.priority] +
          stateScore[candidate.state] +
          confidenceScore[candidate.confidence] +
          riskScore[candidate.risk] +
          sizeScore(candidate.estimatedMinutes),
        reasons,
        sourceObservedAt: normalizeIso(candidate.sourceObservedAt) ?? candidate.sourceObservedAt,
      });
    }

    recommendations.sort(
      (left, right) =>
        right.score - left.score ||
        left.candidateId.localeCompare(right.candidateId),
    );
    exclusions.sort((left, right) =>
      left.candidateId.localeCompare(right.candidateId),
    );

    return { ok: true, observedAt, recommendations, exclusions };
  }
}
