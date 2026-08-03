import { describe, expect, it } from "vitest";
import {
  classifyDevelopmentActivity,
  defaultProjectResumePolicy,
  type DevelopmentActivityInput,
} from "./development-activity";

const observedAt = "2026-08-03T13:00:00.000Z";

function input(
  overrides: Partial<DevelopmentActivityInput> = {},
): DevelopmentActivityInput {
  return {
    observedAt,
    policy: defaultProjectResumePolicy,
    run: null,
    branchObservation: {
      committedAt: "2026-08-03T12:45:00.000Z",
      observedAt: "2026-08-03T12:50:00.000Z",
    },
    workflowActivity: null,
    ownerHandoffAt: null,
    repositoryObservedAt: "2026-08-03T12:50:00.000Z",
    ...overrides,
  };
}

function runningRun(overrides: Partial<NonNullable<DevelopmentActivityInput["run"]>> = {}) {
  return {
    status: "running" as const,
    lastHeartbeatAt: "2026-08-03T12:55:00.000Z",
    lastCheckpointAt: null,
    staleAfterSeconds: 900,
    finishedAt: null,
    blocker: null,
    waitingForOwner: false,
    ...overrides,
  };
}

describe("classifyDevelopmentActivity", () => {
  it("keeps a run reported active when a fresh heartbeat is stronger than an old commit", () => {
    const result = classifyDevelopmentActivity(
      input({
        run: runningRun(),
        branchObservation: {
          committedAt: "2026-08-03T09:00:00.000Z",
          observedAt: "2026-08-03T12:50:00.000Z",
        },
      }),
    );

    expect(result).toMatchObject({
      status: "reported_active",
      source: "heartbeat",
      confidence: "high",
      activityAt: "2026-08-03T12:55:00.000Z",
      ageMinutes: 5,
      warnings: [],
    });
  });

  it("preserves explicit completed and failed states regardless of commit age", () => {
    expect(
      classifyDevelopmentActivity(
        input({
          run: runningRun({
            status: "completed",
            finishedAt: "2026-08-03T10:00:00.000Z",
            lastHeartbeatAt: "2026-08-03T09:59:00.000Z",
          }),
          branchObservation: null,
        }),
      ),
    ).toMatchObject({ status: "completed", source: "run_terminal", confidence: "high" });

    expect(
      classifyDevelopmentActivity(
        input({
          run: runningRun({
            status: "failed",
            finishedAt: "2026-08-03T10:00:00.000Z",
            lastHeartbeatAt: "2026-08-03T09:59:00.000Z",
          }),
          branchObservation: null,
        }),
      ),
    ).toMatchObject({ status: "failed", source: "run_terminal", confidence: "high" });
  });

  it("distinguishes explicit owner action from a persisted blocker", () => {
    expect(
      classifyDevelopmentActivity(
        input({
          run: runningRun({
            status: "blocked",
            blocker: "Choose the deployment target.",
            waitingForOwner: true,
          }),
        }),
      ),
    ).toMatchObject({ status: "waiting_user", source: "owner_action", confidence: "high" });

    expect(
      classifyDevelopmentActivity(
        input({
          run: runningRun({
            status: "blocked",
            blocker: "Android SDK is unavailable.",
          }),
        }),
      ),
    ).toMatchObject({ status: "blocked", source: "run_blocker", confidence: "high" });
  });

  it("uses quiet, warning and probably-ended boundaries without claiming completion", () => {
    const atThirty = classifyDevelopmentActivity(
      input({
        branchObservation: {
          committedAt: "2026-08-03T12:30:00.000Z",
          observedAt: "2026-08-03T12:55:00.000Z",
        },
      }),
    );
    const afterThirty = classifyDevelopmentActivity(
      input({
        branchObservation: {
          committedAt: "2026-08-03T12:29:00.000Z",
          observedAt: "2026-08-03T12:55:00.000Z",
        },
      }),
    );
    const afterSixty = classifyDevelopmentActivity(
      input({
        branchObservation: {
          committedAt: "2026-08-03T11:59:00.000Z",
          observedAt: "2026-08-03T12:55:00.000Z",
        },
      }),
    );

    expect(atThirty).toMatchObject({ status: "quiet", ageMinutes: 30, warnings: [] });
    expect(afterThirty).toMatchObject({
      status: "quiet",
      ageMinutes: 31,
      warnings: ["INACTIVITY_WARNING"],
    });
    expect(afterSixty).toMatchObject({
      status: "probably_ended",
      ageMinutes: 61,
      source: "branch_commit",
      confidence: "medium",
    });
    expect(afterSixty.status).not.toBe("completed");
  });

  it("fails closed when provider observations are stale", () => {
    expect(
      classifyDevelopmentActivity(
        input({
          branchObservation: {
            committedAt: "2026-08-03T12:45:00.000Z",
            observedAt: "2026-08-03T09:59:00.000Z",
          },
          repositoryObservedAt: "2026-08-03T09:59:00.000Z",
        }),
      ),
    ).toMatchObject({
      status: "stale_unknown",
      source: "repository_freshness",
      confidence: "low",
      warnings: ["OBSERVATION_STALE"],
    });
  });

  it("falls back from commits to workflow activity and owner handoffs", () => {
    expect(
      classifyDevelopmentActivity(
        input({
          branchObservation: null,
          workflowActivity: {
            occurredAt: "2026-08-03T12:40:00.000Z",
            observedAt: "2026-08-03T12:50:00.000Z",
          },
        }),
      ),
    ).toMatchObject({ status: "quiet", source: "workflow", ageMinutes: 20 });

    expect(
      classifyDevelopmentActivity(
        input({
          branchObservation: null,
          workflowActivity: null,
          ownerHandoffAt: "2026-08-03T12:35:00.000Z",
          repositoryObservedAt: null,
        }),
      ),
    ).toMatchObject({ status: "quiet", source: "owner_handoff", ageMinutes: 25 });
  });

  it("returns a deterministic unknown state for invalid time or policy input", () => {
    const invalid: DevelopmentActivityInput = input({
      observedAt: "invalid",
      policy: {
        warningAfterMinutes: 60,
        probablyEndedAfterMinutes: 30,
        observationStaleAfterMinutes: 0,
      },
      branchObservation: {
        committedAt: "yesterday",
        observedAt: "also-invalid",
      },
    });

    const first = classifyDevelopmentActivity(invalid);
    const second = classifyDevelopmentActivity(invalid);

    expect(first).toEqual(second);
    expect(first).toMatchObject({
      status: "stale_unknown",
      source: "none",
      confidence: "low",
      activityAt: null,
      ageMinutes: null,
      warnings: [
        "INVALID_OBSERVED_AT",
        "INVALID_POLICY",
        "INVALID_BRANCH_COMMITTED_AT",
        "INVALID_BRANCH_OBSERVED_AT",
      ],
    });
  });
});
