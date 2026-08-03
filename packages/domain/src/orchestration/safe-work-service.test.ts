import { describe, expect, it } from "vitest";
import {
  SafeWorkService,
  type SafeWorkCandidate,
  type SafeWorkEvaluationInput,
} from "./safe-work-service";

const observedAt = "2026-08-03T11:00:00.000Z";

function candidate(
  overrides: Partial<SafeWorkCandidate> = {},
): SafeWorkCandidate {
  return {
    id: "candidate-1",
    projectId: "project-1",
    repositoryId: "repository-1",
    stageId: "stage-1",
    title: "Implement recovery snapshot UI",
    branch: "develop/workflow-control-core",
    scopePatterns: ["apps/web/**"],
    priority: "high",
    state: "next",
    dependencies: [],
    requiredCapabilities: ["node-22", "pnpm-10"],
    ownerDecisionRequired: false,
    estimatedMinutes: 45,
    risk: "medium",
    confidence: "high",
    sourceObservedAt: "2026-08-03T10:55:00.000Z",
    ...overrides,
  };
}

function input(
  candidates: readonly SafeWorkCandidate[],
  overrides: Partial<SafeWorkEvaluationInput> = {},
): SafeWorkEvaluationInput {
  return {
    observedAt,
    availableCapabilities: ["node-22", "pnpm-10", "github-write"],
    candidates,
    reservations: [],
    verificationObligations: [],
    ...overrides,
  };
}

describe("SafeWorkService.evaluate", () => {
  it("orders executable work by priority, state, confidence, risk and size", () => {
    const service = new SafeWorkService();
    const result = service.evaluate(
      input([
        candidate({
          id: "medium-large",
          title: "Medium large task",
          priority: "medium",
          estimatedMinutes: 120,
        }),
        candidate({
          id: "critical-small",
          title: "Critical small task",
          priority: "critical",
          estimatedMinutes: 20,
          risk: "low",
        }),
        candidate({
          id: "critical-risky",
          title: "Critical risky task",
          priority: "critical",
          estimatedMinutes: 90,
          risk: "high",
          confidence: "medium",
        }),
      ]),
    );

    expect(result.recommendations.map((item) => item.candidateId)).toEqual([
      "critical-small",
      "critical-risky",
      "medium-large",
    ]);
    expect(result.recommendations[0]).toMatchObject({
      reasons: expect.arrayContaining([
        "PRIORITY_CRITICAL",
        "CAPABILITIES_AVAILABLE",
        "NO_SCOPE_CONFLICT",
      ]),
    });
    expect(result.exclusions).toEqual([]);
  });

  it("excludes work with incomplete dependencies or an owner decision", () => {
    const service = new SafeWorkService();
    const result = service.evaluate(
      input([
        candidate({
          id: "dependency-blocked",
          dependencies: [{ id: "foundation", status: "pending" }],
        }),
        candidate({ id: "owner-blocked", ownerDecisionRequired: true }),
      ]),
    );

    expect(result.recommendations).toEqual([]);
    expect(result.exclusions).toEqual([
      {
        candidateId: "dependency-blocked",
        codes: ["DEPENDENCY_INCOMPLETE"],
        details: ["foundation"],
      },
      {
        candidateId: "owner-blocked",
        codes: ["OWNER_DECISION_REQUIRED"],
        details: [],
      },
    ]);
  });

  it("excludes work that overlaps an active reservation on the same branch", () => {
    const service = new SafeWorkService();
    const result = service.evaluate(
      input([candidate()], {
        reservations: [
          {
            id: "reservation-active",
            projectId: "project-1",
            repositoryId: "repository-1",
            runId: "run-other",
            branch: "develop/workflow-control-core",
            kind: "directory",
            patterns: ["apps/web/**"],
            holderLabel: "agent-b",
            purpose: "Build the DevOS UI.",
            state: "active",
            acquiredAt: "2026-08-03T10:00:00.000Z",
            renewedAt: "2026-08-03T10:30:00.000Z",
            expiresAt: "2026-08-03T12:00:00.000Z",
            releasedAt: null,
            version: 1,
          },
        ],
      }),
    );

    expect(result.recommendations).toEqual([]);
    expect(result.exclusions).toEqual([
      {
        candidateId: "candidate-1",
        codes: ["SCOPE_RESERVED"],
        details: ["reservation-active"],
      },
    ]);
  });

  it("ignores expired reservations and excludes missing runtime capabilities", () => {
    const service = new SafeWorkService();
    const result = service.evaluate(
      input(
        [
          candidate({ id: "available" }),
          candidate({
            id: "android",
            requiredCapabilities: ["android-sdk", "node-22"],
          }),
        ],
        {
          reservations: [
            {
              id: "reservation-expired",
              projectId: "project-1",
              repositoryId: "repository-1",
              runId: "run-old",
              branch: "develop/workflow-control-core",
              kind: "directory",
              patterns: ["apps/web/**"],
              holderLabel: "agent-old",
              purpose: "Old work.",
              state: "active",
              acquiredAt: "2026-08-03T08:00:00.000Z",
              renewedAt: "2026-08-03T08:00:00.000Z",
              expiresAt: "2026-08-03T09:00:00.000Z",
              releasedAt: null,
              version: 1,
            },
          ],
        },
      ),
    );

    expect(result.recommendations.map((item) => item.candidateId)).toEqual([
      "available",
    ]);
    expect(result.exclusions).toEqual([
      {
        candidateId: "android",
        codes: ["CAPABILITY_MISSING"],
        details: ["android-sdk"],
      },
    ]);
  });

  it("excludes a candidate when a required pre-work gate is unresolved", () => {
    const service = new SafeWorkService();
    const result = service.evaluate(
      input([candidate()], {
        verificationObligations: [
          {
            id: "verification-1",
            stageId: "stage-1",
            status: "blocked",
            gateName: "Generate API types",
            requiredBeforeWork: true,
          },
        ],
      }),
    );

    expect(result.exclusions).toEqual([
      {
        candidateId: "candidate-1",
        codes: ["PREREQUISITE_GATE_UNRESOLVED"],
        details: ["verification-1"],
      },
    ]);
  });

  it("rejects stale or invalid evaluation inputs rather than inventing a ranking", () => {
    const service = new SafeWorkService();
    expect(
      service.evaluate(
        input([
          candidate({
            sourceObservedAt: "2026-07-01T00:00:00.000Z",
          }),
        ], { observedAt: "invalid" }),
      ),
    ).toMatchObject({
      ok: false,
      code: "VALIDATION_FAILED",
      errors: ["OBSERVED_AT_INVALID"],
      recommendations: [],
      exclusions: [],
    });
  });
});
