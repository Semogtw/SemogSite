import { describe, expect, it } from "vitest";
import {
  GitHubSyncService,
  type GitHubObservationSource,
  type GitHubSyncStore,
  type RepositoryObservationResult,
  type RepositorySyncTarget,
  type SyncIdentityFactory,
} from "./github-sync-service";
import type { RepositoryObservationAggregate } from "./repository-sync-record";

const now = "2026-08-01T19:00:00.000Z";
const targets: RepositorySyncTarget[] = [
  {
    id: "repository-1",
    owner: "Semogtw",
    name: "SemogSite",
    fullName: "Semogtw/SemogSite",
    defaultBranch: "main",
    currentActiveBranch: "develop/foundation-bootstrap",
  },
  {
    id: "repository-2",
    owner: "Semogtw",
    name: "Other",
    fullName: "Semogtw/Other",
    defaultBranch: "main",
    currentActiveBranch: null,
  },
];

function observed(fullName: string): RepositoryObservationResult {
  return {
    ok: true,
    observation: {
      githubNodeId: `node-${fullName}`,
      fullName,
      visibility: "private",
      defaultBranch: "main",
      htmlUrl: `https://github.com/${fullName}`,
      archived: false,
      pushedAt: "2026-08-01T18:40:00.000Z",
      providerUpdatedAt: "2026-08-01T18:45:00.000Z",
      observedAt: now,
      apiVersion: "2026-03-10",
      etag: '"etag"',
      rateLimitRemaining: 4990,
      rateLimitResetAt: "2026-08-01T20:00:00.000Z",
      branchesTruncated: false,
      branches: [
        {
          name: "main",
          headSha: "1111111",
          committedAt: "2026-07-28T10:00:00.000Z",
          protected: true,
        },
        {
          name: "develop/foundation-bootstrap",
          headSha: "2222222",
          committedAt: "2026-08-01T18:30:00.000Z",
          protected: false,
        },
      ],
      warnings: [],
    },
  };
}

class RecordingStore implements GitHubSyncStore {
  readonly observations: RepositoryObservationAggregate[] = [];
  readonly finished: unknown[] = [];

  constructor(
    private readonly targetList: readonly RepositorySyncTarget[],
    private readonly duplicateIds = new Set<string>(),
  ) {}

  async listTargets(): Promise<readonly RepositorySyncTarget[]> {
    return this.targetList;
  }

  async startRun(): Promise<void> {}

  async recordObservation(
    observation: RepositoryObservationAggregate,
  ): Promise<"inserted" | "duplicate"> {
    this.observations.push(observation);
    return this.duplicateIds.has(observation.repository.repositoryId)
      ? "duplicate"
      : "inserted";
  }

  async finishRun(run: unknown): Promise<void> {
    this.finished.push(run);
  }
}

function identity(): SyncIdentityFactory {
  let counter = 0;
  return {
    nextId(prefix) {
      counter += 1;
      return `${prefix}-${counter}`;
    },
    hash(value) {
      return `hash:${value}`;
    },
  };
}

describe("GitHubSyncService", () => {
  it("records bounded observations and completes a successful run", async () => {
    const store = new RecordingStore(targets, new Set(["repository-2"]));
    const source: GitHubObservationSource = {
      observe: async (target, maxBranches) => {
        expect(maxBranches).toBe(25);
        return observed(target.fullName);
      },
    };
    const service = new GitHubSyncService(store, source, identity());

    const result = await service.synchronize({ runId: "run-1", now });

    expect(result).toMatchObject({
      status: "success",
      createdCount: 1,
      skippedCount: 1,
      errorCount: 0,
      processedTargets: 2,
      rateLimitRemaining: 4990,
    });
    expect(store.observations[0]).toMatchObject({
      repository: {
        repositoryId: "repository-1",
        defaultBranch: "main",
      },
      recommendation: {
        status: "recommended",
        branch: "develop/foundation-bootstrap",
      },
    });
    expect(store.finished).toHaveLength(1);
  });

  it("finishes partial when one repository is rate limited", async () => {
    const store = new RecordingStore(targets);
    const source: GitHubObservationSource = {
      observe: async (target) =>
        target.id === "repository-1"
          ? observed(target.fullName)
          : {
              ok: false,
              failure: {
                code: "RATE_LIMITED",
                retryAt: "2026-08-01T20:00:00.000Z",
              },
            },
    };
    const service = new GitHubSyncService(store, source, identity());

    const result = await service.synchronize({ runId: "run-partial", now });

    expect(result).toMatchObject({
      status: "partial",
      createdCount: 1,
      errorCount: 1,
      rateLimitResetAt: "2026-08-01T20:00:00.000Z",
      warnings: ["repository-2:RATE_LIMITED"],
    });
  });

  it("finishes failed when every target fails", async () => {
    const store = new RecordingStore(targets);
    const source: GitHubObservationSource = {
      observe: async () => ({
        ok: false,
        failure: { code: "NOT_FOUND", retryAt: null },
      }),
    };
    const service = new GitHubSyncService(store, source, identity());

    await expect(
      service.synchronize({ runId: "run-failed", now }),
    ).resolves.toMatchObject({
      status: "failed",
      createdCount: 0,
      errorCount: 2,
    });
  });

  it("fails an empty target set without provider calls", async () => {
    const store = new RecordingStore([]);
    let providerCalled = false;
    const source: GitHubObservationSource = {
      observe: async () => {
        providerCalled = true;
        return observed("Semogtw/Unexpected");
      },
    };
    const service = new GitHubSyncService(store, source, identity());

    await expect(
      service.synchronize({ runId: "run-empty", now }),
    ).resolves.toMatchObject({
      status: "failed",
      processedTargets: 0,
      errorCount: 1,
      warnings: ["NO_SYNC_TARGETS"],
    });
    expect(providerCalled).toBe(false);
  });
});
