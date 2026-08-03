import type { CooperativeRunStatus } from "../runs/run-state";

export type DevelopmentActivityStatus =
  | "reported_active"
  | "quiet"
  | "probably_ended"
  | "stale_unknown"
  | "waiting_user"
  | "blocked"
  | "completed"
  | "failed";

export type DevelopmentActivitySource =
  | "run_terminal"
  | "owner_action"
  | "run_blocker"
  | "heartbeat"
  | "checkpoint"
  | "branch_commit"
  | "workflow"
  | "owner_handoff"
  | "repository_freshness"
  | "none";

export type DevelopmentActivityConfidence = "high" | "medium" | "low";

export type ProjectResumePolicy = {
  warningAfterMinutes: number;
  probablyEndedAfterMinutes: number;
  observationStaleAfterMinutes: number;
};

export const defaultProjectResumePolicy: ProjectResumePolicy = {
  warningAfterMinutes: 30,
  probablyEndedAfterMinutes: 60,
  observationStaleAfterMinutes: 180,
};

export type DevelopmentActivityRunSignal = {
  status: CooperativeRunStatus;
  lastHeartbeatAt: string | null;
  lastCheckpointAt: string | null;
  staleAfterSeconds: number;
  finishedAt: string | null;
  blocker: string | null;
  waitingForOwner: boolean;
};

export type DevelopmentActivityObservedSignal = {
  occurredAt: string;
  observedAt: string;
};

export type DevelopmentActivityInput = {
  observedAt: string;
  policy: ProjectResumePolicy;
  run: DevelopmentActivityRunSignal | null;
  branchObservation: {
    committedAt: string;
    observedAt: string;
  } | null;
  workflowActivity: DevelopmentActivityObservedSignal | null;
  ownerHandoffAt: string | null;
  repositoryObservedAt: string | null;
};

export type DevelopmentActivityWarning =
  | "INVALID_OBSERVED_AT"
  | "INVALID_POLICY"
  | "INVALID_RUN_HEARTBEAT_AT"
  | "INVALID_RUN_CHECKPOINT_AT"
  | "INVALID_RUN_FINISHED_AT"
  | "INVALID_RUN_STALE_THRESHOLD"
  | "INVALID_BRANCH_COMMITTED_AT"
  | "INVALID_BRANCH_OBSERVED_AT"
  | "INVALID_WORKFLOW_OCCURRED_AT"
  | "INVALID_WORKFLOW_OBSERVED_AT"
  | "INVALID_OWNER_HANDOFF_AT"
  | "INVALID_REPOSITORY_OBSERVED_AT"
  | "ACTIVITY_IN_FUTURE"
  | "INACTIVITY_WARNING"
  | "OBSERVATION_STALE"
  | "RUN_CANCELLED";

export type DevelopmentActivity = {
  status: DevelopmentActivityStatus;
  source: DevelopmentActivitySource;
  confidence: DevelopmentActivityConfidence;
  observedAt: string | null;
  activityAt: string | null;
  sourceObservedAt: string | null;
  ageMinutes: number | null;
  warnings: readonly DevelopmentActivityWarning[];
};

type NormalizedTime = {
  iso: string;
  epoch: number;
};

type Candidate = {
  source: "branch_commit" | "workflow" | "owner_handoff";
  activity: NormalizedTime;
  sourceObservedAt: NormalizedTime | null;
  rank: number;
};

function normalizeTime(
  value: string | null,
  warning: DevelopmentActivityWarning,
  warnings: DevelopmentActivityWarning[],
): NormalizedTime | null {
  if (value === null) return null;
  const epoch = Date.parse(value);
  if (Number.isNaN(epoch)) {
    warnings.push(warning);
    return null;
  }
  return { iso: new Date(epoch).toISOString(), epoch };
}

function validPolicy(policy: ProjectResumePolicy): boolean {
  return (
    Number.isInteger(policy.warningAfterMinutes) &&
    policy.warningAfterMinutes > 0 &&
    Number.isInteger(policy.probablyEndedAfterMinutes) &&
    policy.probablyEndedAfterMinutes > policy.warningAfterMinutes &&
    Number.isInteger(policy.observationStaleAfterMinutes) &&
    policy.observationStaleAfterMinutes > 0
  );
}

function ageMinutes(
  observedAt: NormalizedTime,
  activityAt: NormalizedTime,
  warnings: DevelopmentActivityWarning[],
): number {
  if (activityAt.epoch > observedAt.epoch) {
    warnings.push("ACTIVITY_IN_FUTURE");
    return 0;
  }
  return Math.floor((observedAt.epoch - activityAt.epoch) / 60_000);
}

function output(input: {
  status: DevelopmentActivityStatus;
  source: DevelopmentActivitySource;
  confidence: DevelopmentActivityConfidence;
  observedAt: NormalizedTime | null;
  activityAt: NormalizedTime | null;
  sourceObservedAt?: NormalizedTime | null;
  warnings: DevelopmentActivityWarning[];
}): DevelopmentActivity {
  return {
    status: input.status,
    source: input.source,
    confidence: input.confidence,
    observedAt: input.observedAt?.iso ?? null,
    activityAt: input.activityAt?.iso ?? null,
    sourceObservedAt: input.sourceObservedAt?.iso ?? null,
    ageMinutes:
      input.observedAt === null || input.activityAt === null
        ? null
        : ageMinutes(input.observedAt, input.activityAt, input.warnings),
    warnings: input.warnings,
  };
}

function observationIsStale(
  sourceObservedAt: NormalizedTime,
  observedAt: NormalizedTime,
  policy: ProjectResumePolicy,
): boolean {
  return (
    observedAt.epoch - sourceObservedAt.epoch >
    policy.observationStaleAfterMinutes * 60_000
  );
}

export function classifyDevelopmentActivity(
  input: DevelopmentActivityInput,
): DevelopmentActivity {
  const warnings: DevelopmentActivityWarning[] = [];
  const observedAt = normalizeTime(
    input.observedAt,
    "INVALID_OBSERVED_AT",
    warnings,
  );
  const policyValid = validPolicy(input.policy);
  if (!policyValid) warnings.push("INVALID_POLICY");

  const heartbeatAt = normalizeTime(
    input.run?.lastHeartbeatAt ?? null,
    "INVALID_RUN_HEARTBEAT_AT",
    warnings,
  );
  const checkpointAt = normalizeTime(
    input.run?.lastCheckpointAt ?? null,
    "INVALID_RUN_CHECKPOINT_AT",
    warnings,
  );
  const finishedAt = normalizeTime(
    input.run?.finishedAt ?? null,
    "INVALID_RUN_FINISHED_AT",
    warnings,
  );
  if (
    input.run !== null &&
    (!Number.isInteger(input.run.staleAfterSeconds) ||
      input.run.staleAfterSeconds < 300 ||
      input.run.staleAfterSeconds > 86_400)
  ) {
    warnings.push("INVALID_RUN_STALE_THRESHOLD");
  }

  const branchCommittedAt = normalizeTime(
    input.branchObservation?.committedAt ?? null,
    "INVALID_BRANCH_COMMITTED_AT",
    warnings,
  );
  const branchObservedAt = normalizeTime(
    input.branchObservation?.observedAt ?? null,
    "INVALID_BRANCH_OBSERVED_AT",
    warnings,
  );
  const workflowOccurredAt = normalizeTime(
    input.workflowActivity?.occurredAt ?? null,
    "INVALID_WORKFLOW_OCCURRED_AT",
    warnings,
  );
  const workflowObservedAt = normalizeTime(
    input.workflowActivity?.observedAt ?? null,
    "INVALID_WORKFLOW_OBSERVED_AT",
    warnings,
  );
  const ownerHandoffAt = normalizeTime(
    input.ownerHandoffAt,
    "INVALID_OWNER_HANDOFF_AT",
    warnings,
  );
  const repositoryObservedAt = normalizeTime(
    input.repositoryObservedAt,
    "INVALID_REPOSITORY_OBSERVED_AT",
    warnings,
  );

  if (observedAt === null || !policyValid) {
    return output({
      status: "stale_unknown",
      source: "none",
      confidence: "low",
      observedAt,
      activityAt: null,
      warnings,
    });
  }

  if (input.run?.status === "completed") {
    return output({
      status: "completed",
      source: "run_terminal",
      confidence: "high",
      observedAt,
      activityAt: finishedAt ?? checkpointAt ?? heartbeatAt,
      warnings,
    });
  }
  if (input.run?.status === "failed") {
    return output({
      status: "failed",
      source: "run_terminal",
      confidence: "high",
      observedAt,
      activityAt: finishedAt ?? checkpointAt ?? heartbeatAt,
      warnings,
    });
  }
  if (input.run?.status === "cancelled") {
    warnings.push("RUN_CANCELLED");
    return output({
      status: "stale_unknown",
      source: "run_terminal",
      confidence: "high",
      observedAt,
      activityAt: finishedAt ?? checkpointAt ?? heartbeatAt,
      warnings,
    });
  }
  if (input.run?.waitingForOwner === true) {
    return output({
      status: "waiting_user",
      source: "owner_action",
      confidence: "high",
      observedAt,
      activityAt: checkpointAt ?? heartbeatAt,
      warnings,
    });
  }
  if (input.run?.status === "blocked") {
    return output({
      status: "blocked",
      source: "run_blocker",
      confidence: "high",
      observedAt,
      activityAt: checkpointAt ?? heartbeatAt,
      warnings,
    });
  }

  if (
    input.run?.status === "running" &&
    Number.isInteger(input.run.staleAfterSeconds) &&
    input.run.staleAfterSeconds >= 300 &&
    input.run.staleAfterSeconds <= 86_400
  ) {
    const freshestRunSignal = [
      checkpointAt === null
        ? null
        : { source: "checkpoint" as const, time: checkpointAt, rank: 1 },
      heartbeatAt === null
        ? null
        : { source: "heartbeat" as const, time: heartbeatAt, rank: 0 },
    ]
      .filter((signal): signal is NonNullable<typeof signal> => signal !== null)
      .sort(
        (left, right) =>
          right.time.epoch - left.time.epoch || left.rank - right.rank,
      )[0];

    if (
      freshestRunSignal !== undefined &&
      observedAt.epoch - freshestRunSignal.time.epoch <=
        input.run.staleAfterSeconds * 1_000
    ) {
      return output({
        status: "reported_active",
        source: freshestRunSignal.source,
        confidence: "high",
        observedAt,
        activityAt: freshestRunSignal.time,
        warnings,
      });
    }
  }

  const candidates: Candidate[] = [];
  let staleProviderEvidence = false;
  if (branchCommittedAt !== null && branchObservedAt !== null) {
    if (observationIsStale(branchObservedAt, observedAt, input.policy)) {
      staleProviderEvidence = true;
    } else {
      candidates.push({
        source: "branch_commit",
        activity: branchCommittedAt,
        sourceObservedAt: branchObservedAt,
        rank: 0,
      });
    }
  }
  if (workflowOccurredAt !== null && workflowObservedAt !== null) {
    if (observationIsStale(workflowObservedAt, observedAt, input.policy)) {
      staleProviderEvidence = true;
    } else {
      candidates.push({
        source: "workflow",
        activity: workflowOccurredAt,
        sourceObservedAt: workflowObservedAt,
        rank: 1,
      });
    }
  }
  if (ownerHandoffAt !== null) {
    candidates.push({
      source: "owner_handoff",
      activity: ownerHandoffAt,
      sourceObservedAt: null,
      rank: 2,
    });
  }

  const candidate = candidates.sort(
    (left, right) =>
      right.activity.epoch - left.activity.epoch || left.rank - right.rank,
  )[0];
  if (candidate === undefined) {
    if (
      staleProviderEvidence ||
      (repositoryObservedAt !== null &&
        observationIsStale(repositoryObservedAt, observedAt, input.policy))
    ) {
      warnings.push("OBSERVATION_STALE");
      return output({
        status: "stale_unknown",
        source: "repository_freshness",
        confidence: "low",
        observedAt,
        activityAt: null,
        sourceObservedAt: repositoryObservedAt,
        warnings,
      });
    }
    return output({
      status: "stale_unknown",
      source: "none",
      confidence: "low",
      observedAt,
      activityAt: null,
      sourceObservedAt: repositoryObservedAt,
      warnings,
    });
  }

  const inactivityMinutes = ageMinutes(observedAt, candidate.activity, warnings);
  if (inactivityMinutes > input.policy.probablyEndedAfterMinutes) {
    return {
      status: "probably_ended",
      source: candidate.source,
      confidence: "medium",
      observedAt: observedAt.iso,
      activityAt: candidate.activity.iso,
      sourceObservedAt: candidate.sourceObservedAt?.iso ?? null,
      ageMinutes: inactivityMinutes,
      warnings,
    };
  }
  if (inactivityMinutes > input.policy.warningAfterMinutes) {
    warnings.push("INACTIVITY_WARNING");
  }
  return {
    status: "quiet",
    source: candidate.source,
    confidence: "medium",
    observedAt: observedAt.iso,
    activityAt: candidate.activity.iso,
    sourceObservedAt: candidate.sourceObservedAt?.iso ?? null,
    ageMinutes: inactivityMinutes,
    warnings,
  };
}
