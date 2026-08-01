import { describe, expect, it } from "vitest";
import {
  GitHubSyncService,
  type GitHubObservationSource,
  type GitHubSyncStore,
  type RepositorySyncTarget,
  type SyncIdentityFactory,
} from "./github-sync-service";
import type { RepositoryObservationAggregate } from "./repository-sync-record";

class TargetStore implements GitHubSyncStore {
  constructor(private readonly target: RepositorySyncTarget) {}

  async listTargets(): Promise<readonly RepositorySyncTarget[]> {
    return [this.target];
  }

  async startRun(): Promise<void> {}

  async recordObservation(
    _observation: RepositoryObservationAggregate,
  ): Promise<"inserted"> {
    throw new Error("PERSISTENCE_SHOULD_NOT_BE_CALLED");
  }

  async finishRun(): Promise<void> {}
}

const identity: SyncIdentityFactory = {
  nextId: (prefix) => `${prefix}-${crypto.randomUUID()}`,
  hash: (value) => `hash:${value}`,
};

const validTarget: RepositorySyncTarget = {
  id: "repository-1",
  owner: "Semogtw",
  name: "SemogSite",
  fullName: "Semogtw/SemogSite",
  defaultBranch: "main",
  currentActiveBranch: "develop/foundation-bootstrap",
};

describe("GitHubSyncService local target validation", () => {
  it.each([
    { ...validTarget, fullName: "AnotherOwner/AnotherRepo" },
    { ...validTarget, owner: "owner--invalid" },
    { ...validTarget, defaultBranch: "feature branch" },
    { ...validTarget, currentActiveBranch: "bad..branch" },
  ])("rejects an inconsistent local target before provider calls", async (target) => {
    let providerCalled = false;
    const source: GitHubObservationSource = {
      observe: async () => {
        providerCalled = true;
        throw new Error("PROVIDER_SHOULD_NOT_BE_CALLED");
      },
    };

    await expect(
      new GitHubSyncService(
        new TargetStore(target),
        source,
        identity,
      ).synchronize({
        runId: "run-invalid-target",
        now: "2026-08-02T01:30:00.000Z",
      }),
    ).resolves.toMatchObject({
      status: "failed",
      createdCount: 0,
      skippedCount: 0,
      errorCount: 1,
      warnings: ["repository-1:INVALID_SYNC_TARGET"],
    });
    expect(providerCalled).toBe(false);
  });
});
