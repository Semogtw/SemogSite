import { describe, expect, it, vi } from "vitest";
import {
  createAgentAuthorizationMutationExecutor,
  type AgentAuthorizationMutationRepository,
} from "./mutation-executor";

function repository(): AgentAuthorizationMutationRepository {
  return {
    createGrant: vi.fn(async () => ({
      status: "applied",
      affectedRows: 1,
    })),
    consumeTrustSessionOperation: vi.fn(async () => ({
      status: "applied",
      affectedRows: 1,
    })),
    revokeTrustSession: vi.fn(async () => ({
      status: "applied",
      affectedRows: 1,
    })),
    revokeGrant: vi.fn(async (plan) => ({
      status: "applied",
      affectedRows: 1 + plan.revokeTrustSessionIds.length,
    })),
    revokeClient: vi.fn(async (plan) => ({
      status: "applied",
      affectedRows:
        1 +
        plan.revokeGrantIds.length +
        plan.revokeTrustSessionIds.length +
        plan.cancelChallengeIds.length,
    })),
  };
}

const grantCreation = {
  grant: {
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
    version: 1,
  },
  createdAt: "2026-08-05T08:00:00.000Z",
  reason: "Authorize supervised attention maintenance.",
} as const;

const trustConsumption = {
  trustSessionId: "trust_1",
  ownerId: "owner_1",
  clientId: "client_1",
  expectedVersion: 2,
  nextVersion: 3,
  expectedOperationsUsed: 4,
  nextOperationsUsed: 5,
  consumedAt: "2026-08-05T08:00:00.000Z",
} as const;

const trustRevocation = {
  trustSessionId: "trust_1",
  ownerId: "owner_1",
  clientId: "client_1",
  expectedVersion: 2,
  nextVersion: 3,
  revokedAt: "2026-08-05T08:00:00.000Z",
  reason: "The supervised work is complete.",
} as const;

const grantRevocation = {
  grantId: "grant_1",
  ownerId: "owner_1",
  clientId: "client_1",
  fromStatus: "active",
  toStatus: "revoked",
  expectedVersion: 2,
  nextVersion: 3,
  revokeTrustSessionIds: ["trust_1", "trust_2"],
  changedAt: "2026-08-05T08:00:00.000Z",
  reason: "Remove the authorization.",
} as const;

const clientRevocation = {
  ownerId: "owner_1",
  clientId: "client_1",
  expectedClientVersion: 4,
  nextClientVersion: 5,
  revokeGrantIds: ["grant_1", "grant_2"],
  revokeTrustSessionIds: ["trust_1"],
  cancelChallengeIds: ["challenge_1", "challenge_2"],
  revokedAt: "2026-08-05T08:00:00.000Z",
  reason: "Disconnect the client.",
} as const;

describe("agent authorization mutation executor", () => {
  it("dispatches each mutation to one atomic repository operation", async () => {
    const store = repository();
    const execute = createAgentAuthorizationMutationExecutor(store);

    await expect(
      execute({ kind: "grant.create", plan: grantCreation }),
    ).resolves.toEqual({ status: "applied", affectedRows: 1 });
    await expect(
      execute({ kind: "trust.consume", plan: trustConsumption }),
    ).resolves.toEqual({ status: "applied", affectedRows: 1 });
    await expect(
      execute({ kind: "trust.revoke", plan: trustRevocation }),
    ).resolves.toEqual({ status: "applied", affectedRows: 1 });
    await expect(
      execute({ kind: "grant.revoke", plan: grantRevocation }),
    ).resolves.toEqual({ status: "applied", affectedRows: 3 });
    await expect(
      execute({ kind: "client.revoke", plan: clientRevocation }),
    ).resolves.toEqual({ status: "applied", affectedRows: 6 });

    expect(store.createGrant).toHaveBeenCalledWith(grantCreation);
    expect(store.consumeTrustSessionOperation).toHaveBeenCalledWith(
      trustConsumption,
    );
    expect(store.revokeTrustSession).toHaveBeenCalledWith(trustRevocation);
    expect(store.revokeGrant).toHaveBeenCalledWith(grantRevocation);
    expect(store.revokeClient).toHaveBeenCalledWith(clientRevocation);
  });

  it.each(["conflict", "not_found", "already_applied"] as const)(
    "accepts fail-closed zero-write result %s",
    async (status) => {
      const store = repository();
      vi.mocked(store.revokeTrustSession).mockResolvedValue({
        status,
        affectedRows: 0,
      });

      await expect(
        createAgentAuthorizationMutationExecutor(store)({
          kind: "trust.revoke",
          plan: trustRevocation,
        }),
      ).resolves.toEqual({ status, affectedRows: 0 });
    },
  );

  it("rejects partial or over-broad writes reported by an adapter", async () => {
    const store = repository();
    vi.mocked(store.revokeGrant).mockResolvedValue({
      status: "applied",
      affectedRows: 2,
    });

    await expect(
      createAgentAuthorizationMutationExecutor(store)({
        kind: "grant.revoke",
        plan: grantRevocation,
      }),
    ).rejects.toThrow("AGENT_AUTHORIZATION_MUTATION_RESULT_INVALID");
  });

  it("rejects writes attached to non-applied outcomes", async () => {
    const store = repository();
    vi.mocked(store.revokeClient).mockResolvedValue({
      status: "conflict",
      affectedRows: 1,
    });

    await expect(
      createAgentAuthorizationMutationExecutor(store)({
        kind: "client.revoke",
        plan: clientRevocation,
      }),
    ).rejects.toThrow("AGENT_AUTHORIZATION_MUTATION_RESULT_INVALID");
  });

  it("fails closed for an unknown mutation kind at runtime", async () => {
    const execute = createAgentAuthorizationMutationExecutor(repository());

    await expect(
      execute({ kind: "unknown", plan: trustRevocation } as never),
    ).rejects.toThrow("AGENT_AUTHORIZATION_MUTATION_UNSUPPORTED");
  });
});
