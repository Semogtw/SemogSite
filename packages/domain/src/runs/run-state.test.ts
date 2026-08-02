import { describe, expect, it } from "vitest";
import {
  applyRunTransition,
  deriveRunFreshness,
  type CooperativeRunSnapshot,
  type RunTransitionContext,
} from "./run-state";

const running: CooperativeRunSnapshot = {
  id: "run-1",
  projectId: "project-1",
  title: "Foundation implementation",
  actorLabel: "ChatGPT",
  origin: "chatgpt",
  status: "running",
  phase: "MCP hardening",
  progress: 40,
  branch: "develop/foundation-bootstrap",
  summary: "Read adapter implemented.",
  blocker: null,
  nextAction: "Run dependency-complete protocol tests.",
  startedAt: "2026-08-01T18:00:00.000Z",
  lastHeartbeatAt: "2026-08-01T20:00:00.000Z",
  finishedAt: null,
  staleAfterSeconds: 3_600,
  updatedAt: "2026-08-01T20:00:00.000Z",
};

function context(
  now = "2026-08-01T20:30:00.000Z",
): RunTransitionContext {
  return {
    now,
    expectedUpdatedAt: running.updatedAt,
  };
}

describe("deriveRunFreshness", () => {
  it("uses a deterministic inclusive stale boundary without mutating status", () => {
    expect(
      deriveRunFreshness(running, "2026-08-01T20:59:59.999Z"),
    ).toEqual({ status: "current", staleAt: "2026-08-01T21:00:00.000Z" });
    expect(
      deriveRunFreshness(running, "2026-08-01T21:00:00.000Z"),
    ).toEqual({ status: "stale", staleAt: "2026-08-01T21:00:00.000Z" });
    expect(running.status).toBe("running");
  });

  it("keeps terminal runs current and reports invalid observation time", () => {
    const completed: CooperativeRunSnapshot = {
      ...running,
      status: "completed",
      progress: 100,
      nextAction: null,
      finishedAt: "2026-08-01T20:30:00.000Z",
      updatedAt: "2026-08-01T20:30:00.000Z",
    };
    expect(
      deriveRunFreshness(completed, "2026-08-03T20:30:00.000Z"),
    ).toEqual({ status: "current", staleAt: null });
    expect(() => deriveRunFreshness(running, "invalid")).toThrow(
      "RUN_OBSERVED_AT_INVALID",
    );
  });
});

describe("applyRunTransition", () => {
  it("applies a heartbeat without changing lifecycle status or decreasing progress", () => {
    const result = applyRunTransition(
      running,
      {
        kind: "heartbeat",
        summary: "Still validating the MCP package.",
        phase: "Protocol validation",
        nextAction: "Run the official client suite.",
      },
      context(),
    );

    expect(result).toEqual({
      ok: true,
      before: running,
      after: {
        ...running,
        phase: "Protocol validation",
        summary: "Still validating the MCP package.",
        nextAction: "Run the official client suite.",
        lastHeartbeatAt: "2026-08-01T20:30:00.000Z",
        updatedAt: "2026-08-01T20:30:00.000Z",
      },
      event: {
        kind: "run.heartbeat",
        occurredAt: "2026-08-01T20:30:00.000Z",
        summary: "Still validating the MCP package.",
      },
    });
  });

  it("records a monotonic checkpoint and rejects progress regression", () => {
    const result = applyRunTransition(
      running,
      {
        kind: "checkpoint",
        progress: 55,
        summary: "Static verification completed.",
        nextAction: "Install and run SDK-backed tests.",
      },
      context(),
    );
    expect(result).toMatchObject({
      ok: true,
      after: {
        status: "running",
        progress: 55,
        lastHeartbeatAt: "2026-08-01T20:30:00.000Z",
      },
      event: { kind: "run.checkpoint" },
    });

    expect(
      applyRunTransition(
        running,
        {
          kind: "checkpoint",
          progress: 39,
          summary: "Invalid regression.",
          nextAction: "Retry.",
        },
        context(),
      ),
    ).toEqual({
      ok: false,
      code: "VALIDATION_FAILED",
      errors: ["PROGRESS_REGRESSION"],
    });
  });

  it("blocks and resumes with explicit blocker/unlock state", () => {
    const blocked = applyRunTransition(
      running,
      {
        kind: "block",
        blocker: "Registry DNS is unavailable.",
        nextAction: "Retry in a dependency-complete environment.",
        summary: "Protocol gates cannot run here.",
      },
      context(),
    );
    expect(blocked).toMatchObject({
      ok: true,
      after: {
        status: "blocked",
        blocker: "Registry DNS is unavailable.",
        nextAction: "Retry in a dependency-complete environment.",
        finishedAt: null,
      },
      event: { kind: "run.blocked" },
    });
    if (!blocked.ok) throw new Error("EXPECTED_BLOCKED_RUN");

    expect(
      applyRunTransition(
        blocked.after,
        {
          kind: "resume",
          summary: "Registry access restored.",
          nextAction: "Run MCP tests.",
        },
        {
          now: "2026-08-01T21:00:00.000Z",
          expectedUpdatedAt: blocked.after.updatedAt,
        },
      ),
    ).toMatchObject({
      ok: true,
      after: {
        status: "running",
        blocker: null,
        nextAction: "Run MCP tests.",
      },
      event: { kind: "run.resumed" },
    });
  });

  it("requires a valid completed snapshot and makes terminal states immutable", () => {
    const completed = applyRunTransition(
      running,
      {
        kind: "complete",
        progress: 100,
        summary: "All reviewed gates passed.",
      },
      context(),
    );
    expect(completed).toMatchObject({
      ok: true,
      after: {
        status: "completed",
        progress: 100,
        blocker: null,
        nextAction: null,
        finishedAt: "2026-08-01T20:30:00.000Z",
      },
      event: { kind: "run.completed" },
    });
    if (!completed.ok) throw new Error("EXPECTED_COMPLETED_RUN");

    expect(
      applyRunTransition(
        completed.after,
        { kind: "heartbeat", summary: "Should not apply." },
        {
          now: "2026-08-01T21:00:00.000Z",
          expectedUpdatedAt: completed.after.updatedAt,
        },
      ),
    ).toEqual({ ok: false, code: "TERMINAL_RUN" });
  });

  it("fails or cancels nonterminal runs with a reason", () => {
    expect(
      applyRunTransition(
        running,
        {
          kind: "fail",
          reason: "The execution environment terminated unexpectedly.",
          summary: "Work stopped after the last pushed checkpoint.",
        },
        context(),
      ),
    ).toMatchObject({
      ok: true,
      after: {
        status: "failed",
        finishedAt: "2026-08-01T20:30:00.000Z",
        blocker: "The execution environment terminated unexpectedly.",
        nextAction: null,
      },
      event: { kind: "run.failed" },
    });

    expect(
      applyRunTransition(
        running,
        { kind: "cancel", reason: "Owner changed priorities." },
        context(),
      ),
    ).toMatchObject({
      ok: true,
      after: {
        status: "cancelled",
        finishedAt: "2026-08-01T20:30:00.000Z",
        blocker: "Owner changed priorities.",
        nextAction: null,
      },
      event: { kind: "run.cancelled" },
    });
  });

  it("rejects stale state, invalid times, invalid thresholds and missing transition fields", () => {
    expect(
      applyRunTransition(
        running,
        { kind: "heartbeat", summary: "Stale client." },
        { ...context(), expectedUpdatedAt: "2026-08-01T19:59:59.000Z" },
      ),
    ).toEqual({ ok: false, code: "STALE_STATE" });

    expect(
      applyRunTransition(
        { ...running, staleAfterSeconds: 60 },
        { kind: "heartbeat", summary: "Invalid threshold." },
        context(),
      ),
    ).toEqual({
      ok: false,
      code: "INVALID_CURRENT_STATE",
      errors: ["STALE_THRESHOLD_INVALID"],
    });

    expect(
      applyRunTransition(
        running,
        { kind: "block", blocker: " ", nextAction: " " },
        { ...context(), now: "2026-08-01T19:59:59.000Z" },
      ),
    ).toEqual({
      ok: false,
      code: "VALIDATION_FAILED",
      errors: [
        "TRANSITION_TIME_PRECEDES_STATE",
        "BLOCKER_REQUIRED",
        "NEXT_ACTION_REQUIRED",
        "SUMMARY_REQUIRED",
      ],
    });
  });
});
