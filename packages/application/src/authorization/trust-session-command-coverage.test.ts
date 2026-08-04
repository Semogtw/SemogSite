import { describe, expect, it } from "vitest";
import { trustSessionCoversCommand } from "./trust-session";
import type {
  AgentTrustSession,
  EffectiveAgentAuthorization,
} from "./types";

const authorization: EffectiveAgentAuthorization = {
  clientId: "client_1",
  ownerId: "owner_1",
  capabilities: ["attention.write"],
  resourceSelectors: {
    attention_item: [{ kind: "exact_ids", ids: ["attention_1", "attention_2"] }],
  },
  capabilityResourceSelectors: {
    "attention.write": {
      attention_item: [
        { kind: "exact_ids", ids: ["attention_1", "attention_2"] },
      ],
    },
  },
  riskCeiling: "medium",
  riskCeilingByCapability: { "attention.write": "medium" },
  grantIds: ["grant_1"],
  trustSessionIds: [],
};

function session(
  overrides: Partial<AgentTrustSession> = {},
): AgentTrustSession {
  return {
    id: "trust_1",
    ownerId: "owner_1",
    clientId: "client_1",
    baseGrantIds: ["grant_1"],
    capabilities: ["attention.write"],
    resourceSelectors: {
      attention_item: [{ kind: "exact_ids", ids: ["attention_1"] }],
    },
    riskCeiling: "medium",
    startsAt: "2026-08-04T19:00:00.000Z",
    expiresAt: "2026-08-04T21:00:00.000Z",
    maxOperations: 25,
    operationsUsed: 0,
    revokedAt: null,
    reason: "Sessão supervisionada.",
    version: 1,
    ...overrides,
  };
}

const attentionOne = {
  kind: "attention_item",
  id: "attention_1",
  parentRefs: [] as const,
  lifecycleState: "open",
};

describe("trustSessionCoversCommand", () => {
  it("covers a medium command inside the exact trusted capability and resource", () => {
    expect(
      trustSessionCoversCommand({
        session: session(),
        baseAuthorization: authorization,
        capability: "attention.write",
        resource: attentionOne,
        risk: "medium",
        now: "2026-08-04T20:00:00.000Z",
      }),
    ).toBe(true);
  });

  it.each([
    {
      capability: "roadmap.write" as const,
      resource: {
        kind: "stage",
        id: "stage_1",
        parentRefs: [] as const,
        lifecycleState: "active",
      },
      risk: "medium" as const,
    },
    {
      capability: "attention.write" as const,
      resource: { ...attentionOne, id: "attention_2" },
      risk: "medium" as const,
    },
    {
      capability: "attention.write" as const,
      resource: attentionOne,
      risk: "high" as const,
    },
    {
      capability: "attention.write" as const,
      resource: attentionOne,
      risk: "critical" as const,
    },
  ])("does not cover a mismatched command %#", (candidate) => {
    expect(
      trustSessionCoversCommand({
        session: session(),
        baseAuthorization: authorization,
        now: "2026-08-04T20:00:00.000Z",
        ...candidate,
      }),
    ).toBe(false);
  });

  it("does not cover through an expired, revoked or exhausted session", () => {
    for (const candidate of [
      session({ expiresAt: "2026-08-04T20:00:00.000Z" }),
      session({ revokedAt: "2026-08-04T19:30:00.000Z" }),
      session({ operationsUsed: 25 }),
    ]) {
      expect(
        trustSessionCoversCommand({
          session: candidate,
          baseAuthorization: authorization,
          capability: "attention.write",
          resource: attentionOne,
          risk: "medium",
          now: "2026-08-04T20:00:00.000Z",
        }),
      ).toBe(false);
    }
  });

  it("does not let a malformed selector produce coverage", () => {
    expect(
      trustSessionCoversCommand({
        session: session({
          resourceSelectors: {
            attention_item: "all" as never,
          },
        }),
        baseAuthorization: authorization,
        capability: "attention.write",
        resource: attentionOne,
        risk: "medium",
        now: "2026-08-04T20:00:00.000Z",
      }),
    ).toBe(false);
  });
});
