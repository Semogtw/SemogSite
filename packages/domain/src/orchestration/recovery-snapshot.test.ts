import { describe, expect, it } from "vitest";
import {
  buildRecoverySnapshot,
  type RecoverySnapshotInput,
} from "./recovery-snapshot";

const input: RecoverySnapshotInput = {
  snapshotId: "snapshot-1",
  generatedAt: "2026-08-03T10:30:00.000Z",
  sourceObservedAt: "2026-08-03T10:25:00.000Z",
  confidence: "high",
  project: {
    id: "project-1",
    slug: "semogsite",
    name: "SemogSite",
  },
  repository: {
    id: "repository-1",
    fullName: "Semogtw/SemogSite",
    branch: "develop/workflow-control-core",
    observedCommitSha: "a".repeat(40),
  },
  run: {
    id: "run-1",
    phase: "Workflow orchestration core",
    summary: "Scope reservation persistence implemented.",
  },
  stage: {
    id: "stage-1",
    title: "Workflow controls",
    nextStep: "Implement verification persistence.",
  },
  plan: {
    path: "docs/superpowers/plans/2026-08-03-workflow-orchestration-core.md",
    section: "Task 5",
  },
  commits: [
    { sha: "c".repeat(40), message: "feat: later commit" },
    { sha: "b".repeat(40), message: "test: earlier commit" },
  ],
  pushState: "confirmed",
  tests: [
    {
      gateName: "Database typecheck",
      status: "not_run",
      summary: "Awaiting a dependency-complete gate.",
    },
    {
      gateName: "Domain unit tests",
      status: "passed",
      summary: "Scope model tests passed.",
    },
  ],
  obligations: [
    {
      id: "verification-2",
      gateName: "Database typecheck",
      status: "pending",
      nextAction: "Run the database typecheck.",
    },
    {
      id: "verification-1",
      gateName: "Domain unit tests",
      status: "passed",
      nextAction: "Preserve evidence.",
    },
  ],
  reservations: [
    {
      id: "reservation-2",
      repositoryId: "repository-1",
      branch: "develop/workflow-control-core",
      patterns: ["packages/database/**"],
      holderLabel: "agent-b",
      expiresAt: "2026-08-03T12:00:00.000Z",
    },
    {
      id: "reservation-1",
      repositoryId: "repository-1",
      branch: "develop/workflow-control-core",
      patterns: ["packages/domain/**"],
      holderLabel: "agent-a",
      expiresAt: "2026-08-03T11:30:00.000Z",
    },
  ],
  blockers: ["GitHub Actions check is not visible through the connector."],
  decisions: ["Remote MCP is optional for core project tracking."],
  nextAction: "Implement verification persistence and rerun the focused gate.",
  requiredDocuments: [
    "docs/superpowers/specs/2026-08-03-workflow-orchestration-core-design.md",
    "docs/superpowers/plans/2026-08-03-workflow-orchestration-core.md",
  ],
  runtime: {
    label: "ChatGPT GitHub connector",
    capabilities: ["github-write", "github-read"],
    toolchainManifest: null,
  },
  continuation: {
    templateId: "workflow-control-resume",
    templateVersion: 1,
    prompt: "Continue from the exact branch and SHA in this snapshot.",
  },
  warnings: ["Focused tests have not been observed in this environment."],
};

describe("buildRecoverySnapshot", () => {
  it("normalizes unordered evidence into deterministic canonical JSON", () => {
    const first = buildRecoverySnapshot(input);
    const second = buildRecoverySnapshot({
      ...input,
      commits: [...input.commits].reverse(),
      tests: [...input.tests].reverse(),
      obligations: [...input.obligations].reverse(),
      reservations: [...input.reservations].reverse(),
      requiredDocuments: [...input.requiredDocuments].reverse(),
      runtime: {
        ...input.runtime,
        capabilities: [...input.runtime.capabilities].reverse(),
      },
    });

    expect(first).toMatchObject({ ok: true });
    expect(second).toMatchObject({ ok: true });
    if (!first.ok || !second.ok) throw new Error("snapshot should be valid");
    expect(first.canonicalJson).toBe(second.canonicalJson);
    expect(first.snapshot.commits.map((commit) => commit.sha)).toEqual([
      "b".repeat(40),
      "c".repeat(40),
    ]);
    expect(first.snapshot.schemaVersion).toBe(1);
  });

  it("renders a bounded Markdown handoff with source age and exact next action", () => {
    const result = buildRecoverySnapshot(input);
    if (!result.ok) throw new Error("snapshot should be valid");

    expect(result.markdown).toContain("# Recovery snapshot — SemogSite");
    expect(result.markdown).toContain("develop/workflow-control-core");
    expect(result.markdown).toContain("Implement verification persistence");
    expect(result.markdown).toContain("Data observed: 2026-08-03T10:25:00.000Z");
    expect(result.markdown).toContain("Push state: confirmed");
    expect(result.markdown.length).toBeLessThan(20_000);
  });

  it("rejects invalid SHAs, timestamps and sensitive credential-shaped content", () => {
    expect(
      buildRecoverySnapshot({
        ...input,
        repository: { ...input.repository, observedCommitSha: "abc123" },
        generatedAt: "not-a-date",
        continuation: {
          ...input.continuation,
          prompt: "Authorization: Bearer secret-token-value",
        },
      }),
    ).toEqual({
      ok: false,
      code: "VALIDATION_FAILED",
      errors: expect.arrayContaining([
        "GENERATED_AT_INVALID",
        "OBSERVED_COMMIT_SHA_INVALID",
        "SENSITIVE_CONTENT_DETECTED",
      ]),
    });
  });

  it("rejects unsafe document paths and URL-shaped paths", () => {
    expect(
      buildRecoverySnapshot({
        ...input,
        requiredDocuments: ["../private", "https://example.com/document"],
      }),
    ).toMatchObject({
      ok: false,
      code: "VALIDATION_FAILED",
      errors: ["REQUIRED_DOCUMENT_INVALID"],
    });
  });
});
