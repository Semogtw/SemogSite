import { describe, expect, it } from "vitest";
import {
  GitHubSyncService,
  type GitHubObservationSource,
  type GitHubSyncStore,
  type ProviderRepositoryObservation,
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

const validObservation: ProviderRepositoryObservation = {
  githubNodeId: "R_repo",
  fullName: "Semogtw/SemogSite",
  visibility: "private",
  defaultBranch: "main",
  htmlUrl: "https://github.com/Semogtw/SemogSite",
  archived: false,
  pushedAt: null,
  providerUpdatedAt: "2026-08-02T01:10:00.000Z",
  observedAt: "2026-08-02T01:15:00.000Z",
  apiVersion: "2026-03-10",
  etag: null,
  rateLimitRemaining: 4700,
  rateLimitResetAt: null,
  branchesTruncated: false,
  branches: [],
  warnings: [],
};

class RecordingStore implements GitHubSyncStore {
  recordCalls = 0;

  async listTargets(): Promise<readonly RepositorySyncTarget[]> {
    return [target];
  }

  async startRun(): Promise<void> {}

  async recordObservation(
    _observation: RepositoryObservationAggregate,
  ): Promise<"inserted"> {
    this.recordCalls += 1;
    return "inserted";
  }

  async finishRun(): Promise<void> {}
}

const identity: SyncIdentityFactory = {
  nextId: (prefix) => `${prefix}-${crypto.randomUUID()}`,
  hash: (value) => `hash:${value}`,
};

describe("GitHubSyncService provider metadata validation", () => {
  it.each([
    [
      "INVALID_PROVIDER_IDENTITY",
      { fullName: "AnotherOwner/AnotherRepo" },
    ],
    [
      "INVALID_PROVIDER_URL",
      { htmlUrl: "http://github.com/Semogtw/SemogSite" },
    ],
    [
      "INVALID_PROVIDER_DEFAULT_BRANCH",
      { defaultBranch: "feature branch" },
    ],
    [
      "INVALID_PROVIDER_TIMESTAMP",
      { providerUpdatedAt: "invalid" },
    ],
    [
      "INVALID_PROVIDER_TIMESTAMP",
      { observedAt: "invalid" },
    ],
    [
      "INVALID_PROVIDER_NODE_ID",
      { githubNodeId: "" },
    ],
    [
      "INVALID_PROVIDER_RATE_LIMIT",
      { rateLimitRemaining: -1 },
    ],
  ] as const)("rejects %s before persistence", async (warning, override) => {
    const store = new RecordingStore();
    const source: GitHubObservationSource = {
      observe: async () => ({
        ok: true,
        observation: { ...validObservation, ...override },
      }),
    };

    const summary = await new GitHubSyncService(
      store,
      source,
      identity,
    ).synchronize({
      runId: `run-${warning}`,
      now: "2026-08-02T01:15:00.000Z",
    });

    expect(summary).toMatchObject({
      status: "failed",
      createdCount: 0,
      skippedCount: 0,
      errorCount: 1,
      warnings: [`repository-1:${warning}`],
    });
    expect(store.recordCalls).toBe(0);
  });
});
