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
    transitionGrantAvailability: vi.fn(applied),
    expireGrant: vi.fn(applied),
    reviseGrant: vi.fn(async (plan) => ({
      status: "applied",
      affectedRows: 1 + plan.revokeTrustSessionIds.length,
    })),
    createTrustSession: vi.fn(applied),
    consumeTrustSessionOperation: vi.fn(applied),
    revokeTrustSession: vi.fn(applied),
    revokeGrant: vi.fn(applied),
    revokeClient: vi.fn(applied),
  };
}

const revision = {
  grantId: "grant_1",
  ownerId: "owner_1",
  clientId: "client_1",
  fromStatus: "active",
  expectedVersion: 7,
  nextVersion: 8,
  nextGrant: {
    id: "grant_1",
    ownerId: "owner_1",
    clientId: "client_1",
    profileId: null,
    status: "active",
    capabilities: ["attention.write"],
    resourceSelectors: {
      attention_item: [{ kind: "exact_ids", ids: ["attention_1"] }],
    },
    riskCeiling: "medium",
    expiresAt: null,
    version: 8,
  },
  revokeTrustSessionIds: ["trust_1", "trust_2"],
  changedAt: "2026-08-05T12:30:00.000Z",
  reason: "Replace the owner-approved authorization scope.",
} as const;

describe("grant revision mutation persistence", () => {
  it("persists the replacement and trust invalidation atomically", async () => {
    const store = repository();

    await expect(
      createAgentAuthorizationMutationExecutor(store)({
        kind: "grant.revise",
        plan: revision,
      }),
    ).resolves.toEqual({ status: "applied", affectedRows: 3 });
    expect(store.reviseGrant).toHaveBeenCalledWith(revision);
  });

  it("rejects partial replacement cascades", async () => {
    const store = repository();
    vi.mocked(store.reviseGrant).mockResolvedValue({
      status: "applied",
      affectedRows: 2,
    });

    await expect(
      createAgentAuthorizationMutationExecutor(store)({
        kind: "grant.revise",
        plan: revision,
      }),
    ).rejects.toThrow("AGENT_AUTHORIZATION_MUTATION_RESULT_INVALID");
  });

  it("rejects replay claims without an idempotency binding", async () => {
    const store = repository();
    vi.mocked(store.reviseGrant).mockResolvedValue({
      status: "already_applied",
      affectedRows: 0,
    });

    await expect(
      createAgentAuthorizationMutationExecutor(store)({
        kind: "grant.revise",
        plan: revision,
      }),
    ).rejects.toThrow("AGENT_AUTHORIZATION_MUTATION_RESULT_INVALID");
  });
});
