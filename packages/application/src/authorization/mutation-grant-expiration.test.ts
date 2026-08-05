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
    expireGrant: vi.fn(async (plan) => ({
      status: "applied" as const,
      affectedRows: 1 + plan.revokeTrustSessionIds.length,
    })),
    reviseGrant: vi.fn(applied),
    createTrustSession: vi.fn(applied),
    consumeTrustSessionOperation: vi.fn(applied),
    revokeTrustSession: vi.fn(applied),
    revokeGrant: vi.fn(applied),
    revokeClient: vi.fn(applied),
  };
}

const expiration = {
  grantId: "grant_1",
  ownerId: "owner_1",
  clientId: "client_1",
  fromStatus: "active",
  toStatus: "expired",
  expectedVersion: 4,
  nextVersion: 5,
  revokeTrustSessionIds: ["trust_1", "trust_2"],
  expiredAt: "2026-08-05T11:30:00.000Z",
  triggeredByActorId: "authorization_sweeper",
  reason: "The grant reached its configured expiry.",
} as const;

describe("grant expiration mutation persistence", () => {
  it("persists grant expiry and trust revocation as one cascade", async () => {
    const store = repository();

    await expect(
      createAgentAuthorizationMutationExecutor(store)({
        kind: "grant.expire",
        plan: expiration,
      }),
    ).resolves.toEqual({ status: "applied" as const, affectedRows: 3 });
    expect(store.expireGrant).toHaveBeenCalledWith(expiration);
  });

  it("rejects partial cascade success", async () => {
    const store = repository();
    vi.mocked(store.expireGrant).mockResolvedValue({
      status: "applied" as const,
      affectedRows: 2,
    });

    await expect(
      createAgentAuthorizationMutationExecutor(store)({
        kind: "grant.expire",
        plan: expiration,
      }),
    ).rejects.toThrow("AGENT_AUTHORIZATION_MUTATION_RESULT_INVALID");
  });

  it.each(["conflict", "not_found", "already_applied"] as const)(
    "accepts zero-write race outcome %s",
    async (status) => {
      const store = repository();
      vi.mocked(store.expireGrant).mockResolvedValue({ status, affectedRows: 0 });

      await expect(
        createAgentAuthorizationMutationExecutor(store)({
          kind: "grant.expire",
          plan: expiration,
        }),
      ).resolves.toEqual({ status, affectedRows: 0 });
    },
  );
});
