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
  currentActiveBranch: "develop/foundation-bootstrap",
};

class Store implements GitHubSyncStore {
  async listTargets(): Promise<readonly RepositorySyncTarget[]> {
    return [target];
  }

  async startRun(): Promise<void> {}

  async recordObservation(
    _observation: RepositoryObservationAggregate,
  ): Promise<"inserted"> {
    return "inserted";
  }

  async finishRun(): Promise<void> {}
}

const identity: SyncIdentityFactory = {
  nextId: (prefix) => `${prefix}-1`,
  hash: (value) => `hash:${value}`,
};

describe("GitHubSyncService partial provider evidence", () => {
  it("persists useful evidence but finishes the run as partial", async () => {
    const source: GitHubObservationSource = {
      observe: async () => ({
        ok: true,
        observation: {
          githubNodeId: "node-1",
          fullName: target.fullName,
          visibility: "private",
          defaultBranch: "main",
          htmlUrl: "https://github.com/Semogtw/SemogSite",
          archived: false,
          pushedAt: null,
          providerUpdatedAt: "2026-08-01T19:00:00.000Z",
          observedAt: "2026-08-01T19:00:00.000Z",
          apiVersion: "2026-03-10",
          etag: null,
          rateLimitRemaining: 4990,
          rateLimitResetAt: null,
          branchesTruncated: false,
          branches: [
            {
              name: "main",
              headSha: "1111111",
              committedAt: "2026-08-01T18:00:00.000Z",
              protected: true,
            },
          ],
          warnings: ["BRANCH_COMMIT_FAILED:develop:RATE_LIMITED"],
          partial: true,
        },
      }),
    };

    const result = await new GitHubSyncService(
      new Store(),
      source,
      identity,
    ).synchronize({
      runId: "run-partial-provider",
      now: "2026-08-01T19:00:00.000Z",
    });

    expect(result).toMatchObject({
      status: "partial",
      createdCount: 1,
      errorCount: 1,
      warnings: [
        "repository-1:PARTIAL_OBSERVATION",
        "repository-1:BRANCH_COMMIT_FAILED:develop:RATE_LIMITED",
      ],
    });
  });
});
