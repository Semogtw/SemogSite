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
    createTrustSession: vi.fn(applied),
    consumeTrustSessionOperation: vi.fn(applied),
    revokeTrustSession: vi.fn(applied),
    revokeGrant: vi.fn(applied),
    revokeClient: vi.fn(applied),
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
  createdAt: "2026-08-05T09:00:00.000Z",
  reason: "Authorize supervised maintenance.",
} as const;

const trustConsumption = {
  trustSessionId: "trust_1",
  ownerId: "owner_1",
  clientId: "client_1",
  expectedVersion: 2,
  nextVersion: 3,
  expectedOperationsUsed: 4,
  nextOperationsUsed: 5,
  consumedAt: "2026-08-05T09:00:00.000Z",
} as const;

describe("authorization mutation result semantics", () => {
  it("rejects not-found from creation operations", async () => {
    const store = repository();
    vi.mocked(store.createGrant).mockResolvedValue({
      status: "not_found",
      affectedRows: 0,
    });

    await expect(
      createAgentAuthorizationMutationExecutor(store)({
        kind: "grant.create",
        plan: grantCreation,
      }),
    ).rejects.toThrow("AGENT_AUTHORIZATION_MUTATION_RESULT_INVALID");
  });

  it("rejects already-applied from non-idempotent trust consumption", async () => {
    const store = repository();
    vi.mocked(store.consumeTrustSessionOperation).mockResolvedValue({
      status: "already_applied",
      affectedRows: 0,
    });

    await expect(
      createAgentAuthorizationMutationExecutor(store)({
        kind: "trust.consume",
        plan: trustConsumption,
      }),
    ).rejects.toThrow("AGENT_AUTHORIZATION_MUTATION_RESULT_INVALID");
  });
});
