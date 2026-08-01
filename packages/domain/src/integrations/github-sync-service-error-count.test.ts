import { describe, expect, it } from "vitest";
import {
  GitHubSyncService,
  type GitHubObservationSource,
  type GitHubSyncStore,
  type RepositorySyncTarget,
  type SyncIdentityFactory,
} from "./github-sync-service";
import type { RepositoryObservationAggregate } from "./repository-sync-record";

const target: RepositorySyncTarget = {
  id: "repository-1",
  owner: "Semogtw",
  name: "SemogSite",
  fullName: "Semogtw/SemogSite",
  defaultBranch: "main",
  currentActiveBranch: "main",
};

class FailingStore implements GitHubSyncStore {
  async listTargets(): Promise<readonly RepositorySyncTarget[]> {
    return [target];
  }

  async startRun(): Promise<void> {}

  async recordObservation(
    _observation: RepositoryObservationAggregate,
  ): Promise<"inserted"> {
    throw new Error("storage unavailable");
  }

  async finishRun(): Promise<void> {}
}

const identity: SyncIdentityFactory = {
  nextId: (prefix) => `${prefix}-${crypto.randomUUID()}`,
  hash: (value) => `hash:${value}`,
};

describe("GitHubSyncService error counting", () => {
  it("counts one target once when partial evidence also fails persistence", async () => {
    const source: GitHubObservationSource = {
      observe: async () => ({
        ok: true,
        observation: {
          githubNodeId: "R_repo",
          fullName: target.fullName,
          visibility: "private",
          defaultBranch: "main",
          htmlUrl: "https://github.com/Semogtw/SemogSite",
          archived: false,
          pushedAt: null,
          providerUpdatedAt: "2026-08-02T01:00:00.000Z",
          observedAt: "2026-08-02T01:00:00.000Z",
          apiVersion: "2026-03-10",
          etag: null,
          rateLimitRemaining: 4800,
          rateLimitResetAt: null,
          branchesTruncated: false,
          branches: [
            {
              name: "main",
              headSha: "1111111",
              committedAt: "2026-08-02T00:50:00.000Z",
              protected: true,
            },
          ],
          warnings: ["BRANCH_COMMIT_FAILED:develop:RATE_LIMITED"],
          partial: true,
        },
      }),
    };

    await expect(
      new GitHubSyncService(
        new FailingStore(),
        source,
        identity,
      ).synchronize({
        runId: "run-single-error-count",
        now: "2026-08-02T01:00:00.000Z",
      }),
    ).resolves.toMatchObject({
      status: "failed",
      createdCount: 0,
      skippedCount: 0,
      errorCount: 1,
      warnings: [
        "repository-1:PARTIAL_OBSERVATION",
        "repository-1:BRANCH_COMMIT_FAILED:develop:RATE_LIMITED",
        "repository-1:STORAGE_FAILURE",
      ],
    });
  });
});
