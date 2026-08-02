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

class RecordingStore implements GitHubSyncStore {
  aggregate: RepositoryObservationAggregate | null = null;

  async listTargets(): Promise<readonly RepositorySyncTarget[]> {
    return [target];
  }

  async startRun(): Promise<void> {}

  async recordObservation(
    observation: RepositoryObservationAggregate,
  ): Promise<"inserted"> {
    this.aggregate = observation;
    return "inserted";
  }

  async finishRun(): Promise<void> {}
}

const identity: SyncIdentityFactory = {
  nextId: (prefix) => `${prefix}-${crypto.randomUUID()}`,
  hash: (value) => `hash:${value}`,
};

describe("GitHubSyncService branch normalization", () => {
  it("drops malformed raw branches and marks the run partial", async () => {
    const store = new RecordingStore();
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
          providerUpdatedAt: "2026-08-02T00:30:00.000Z",
          observedAt: "2026-08-02T00:30:00.000Z",
          apiVersion: "2026-03-10",
          etag: null,
          rateLimitRemaining: 4900,
          rateLimitResetAt: null,
          branchesTruncated: false,
          branches: [
            {
              name: "main",
              headSha: "1111111",
              committedAt: "2026-08-02T00:00:00.000Z",
              protected: true,
            },
            {
              name: "feature branch",
              headSha: "2222222",
              committedAt: "2026-08-02T00:10:00.000Z",
              protected: false,
            },
            {
              name: "bad-date",
              headSha: "3333333",
              committedAt: "invalid",
              protected: false,
            },
          ],
          warnings: [],
        },
      }),
    };

    const summary = await new GitHubSyncService(
      store,
      source,
      identity,
    ).synchronize({
      runId: "run-normalization",
      now: "2026-08-02T00:30:00.000Z",
    });

    expect(summary).toMatchObject({
      status: "partial",
      createdCount: 1,
      errorCount: 1,
      warnings: [
        "repository-1:PARTIAL_RECOMMENDATION_EVIDENCE",
        "repository-1:INVALID_BRANCH_NAME:feature branch",
        "repository-1:INVALID_COMMITTED_AT:bad-date",
      ],
    });
    expect(store.aggregate?.branches).toHaveLength(1);
    expect(store.aggregate?.branches[0]).toMatchObject({
      name: "main",
      headSha: "1111111",
      committedAt: "2026-08-02T00:00:00.000Z",
    });
  });
});
