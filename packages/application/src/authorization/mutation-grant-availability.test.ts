import { describe, expect, it, vi } from "vitest";
import {
  createAgentAuthorizationMutationExecutor,
  type AgentAuthorizationMutationRepository,
} from "./mutation-executor";

function repository(): AgentAuthorizationMutationRepository {
  const applied = async () => ({
    status: "applied" as const,
    affectedRows: 1,
  });
  return {
    createGrant: vi.fn(applied),
    createTrustSession: vi.fn(applied),
    transitionGrantAvailability: vi.fn(applied),
    consumeTrustSessionOperation: vi.fn(applied),
    revokeTrustSession: vi.fn(applied),
    revokeGrant: vi.fn(applied),
    revokeClient: vi.fn(applied),
  };
}

const transition = {
  grantId: "grant_1",
  ownerId: "owner_1",
  clientId: "client_1",
  fromStatus: "active",
  toStatus: "suspended",
  expectedVersion: 2,
  nextVersion: 3,
  changedAt: "2026-08-05T10:30:00.000Z",
  reason: "Pause during owner review.",
} as const;

describe("grant availability mutation persistence", () => {
  it("dispatches the versioned transition as one row", async () => {
    const store = repository();

    await expect(
      createAgentAuthorizationMutationExecutor(store)({
        kind: "grant.transition",
        plan: transition,
      }),
    ).resolves.toEqual({ status: "applied", affectedRows: 1 });
    expect(store.transitionGrantAvailability).toHaveBeenCalledWith(transition);
  });

  it("rejects over-broad transition writes", async () => {
    const store = repository();
    vi.mocked(store.transitionGrantAvailability).mockResolvedValue({
      status: "applied",
      affectedRows: 2,
    });

    await expect(
      createAgentAuthorizationMutationExecutor(store)({
        kind: "grant.transition",
        plan: transition,
      }),
    ).rejects.toThrow("AGENT_AUTHORIZATION_MUTATION_RESULT_INVALID");
  });

  it("rejects replay claims without an idempotency binding", async () => {
    const store = repository();
    vi.mocked(store.transitionGrantAvailability).mockResolvedValue({
      status: "already_applied",
      affectedRows: 0,
    });

    await expect(
      createAgentAuthorizationMutationExecutor(store)({
        kind: "grant.transition",
        plan: transition,
      }),
    ).rejects.toThrow("AGENT_AUTHORIZATION_MUTATION_RESULT_INVALID");
  });
});
