import { describe, expect, it } from "vitest";
import { computeEffectiveAgentAuthorization } from "./effective-grant";
import type {
  AgentGrantDefinition,
  AgentTrustSession,
  OAuthScope,
} from "./types";

const now = "2026-08-04T20:00:00.000Z";

function grant(
  overrides: Partial<AgentGrantDefinition> = {},
): AgentGrantDefinition {
  return {
    id: "grant_attention",
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
    ...overrides,
  };
}

function trust(
  overrides: Partial<AgentTrustSession> = {},
): AgentTrustSession {
  return {
    id: "trust_1",
    ownerId: "owner_1",
    clientId: "client_1",
    baseGrantIds: ["grant_attention"],
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

const attentionScope: readonly OAuthScope[] = ["devos.write.attention"];

describe("computeEffectiveAgentAuthorization", () => {
  it("denies when OAuth scope or an active grant is absent", () => {
    expect(
      computeEffectiveAgentAuthorization({
        ownerId: "owner_1",
        clientId: "client_1",
        oauthScopes: [],
        grants: [grant()],
        trustSessions: [],
        now,
      }),
    ).toBeNull();

    expect(
      computeEffectiveAgentAuthorization({
        ownerId: "owner_1",
        clientId: "client_1",
        oauthScopes: attentionScope,
        grants: [],
        trustSessions: [],
        now,
      }),
    ).toBeNull();
  });

  it.each([
    grant({ ownerId: "owner_other" }),
    grant({ clientId: "client_other" }),
    grant({ status: "suspended" }),
    grant({ status: "revoked" }),
    grant({ status: "expired" }),
    grant({ expiresAt: "2026-08-04T19:59:59.999Z" }),
  ])("ignores a non-effective grant %#", (candidate) => {
    expect(
      computeEffectiveAgentAuthorization({
        ownerId: "owner_1",
        clientId: "client_1",
        oauthScopes: attentionScope,
        grants: [candidate],
        trustSessions: [],
        now,
      }),
    ).toBeNull();
  });

  it("unions narrow selectors only for grants authorizing the same capability", () => {
    const result = computeEffectiveAgentAuthorization({
      ownerId: "owner_1",
      clientId: "client_1",
      oauthScopes: attentionScope,
      grants: [
        grant({
          id: "grant_b",
          resourceSelectors: {
            attention_item: [{ kind: "exact_ids", ids: ["attention_2"] }],
          },
        }),
        grant({ id: "grant_a" }),
      ],
      trustSessions: [],
      now,
    });

    expect(result).toMatchObject({
      capabilities: ["attention.write"],
      grantIds: ["grant_a", "grant_b"],
      riskCeiling: "medium",
      riskCeilingByCapability: { "attention.write": "medium" },
    });
    expect(result?.capabilityResourceSelectors["attention.write"]).toEqual({
      attention_item: [
        { kind: "exact_ids", ids: ["attention_1"] },
        { kind: "exact_ids", ids: ["attention_2"] },
      ],
    });
  });

  it("does not leak selectors or a higher risk ceiling across capabilities", () => {
    const result = computeEffectiveAgentAuthorization({
      ownerId: "owner_1",
      clientId: "client_1",
      oauthScopes: ["devos.write.attention", "devos.write.roadmap"],
      grants: [
        grant(),
        grant({
          id: "grant_roadmap",
          capabilities: ["roadmap.write"],
          resourceSelectors: {
            stage: [{ kind: "exact_ids", ids: ["stage_1"] }],
          },
          riskCeiling: "high",
        }),
      ],
      trustSessions: [],
      now,
    });

    expect(result?.capabilities).toEqual([
      "attention.write",
      "roadmap.write",
    ]);
    expect(result?.riskCeilingByCapability).toEqual({
      "attention.write": "medium",
      "roadmap.write": "high",
    });
    expect(
      result?.capabilityResourceSelectors["attention.write"]?.stage,
    ).toBeUndefined();
    expect(
      result?.capabilityResourceSelectors["roadmap.write"]?.attention_item,
    ).toBeUndefined();
  });

  it("does not authorize a capability without a reviewed resource selector", () => {
    expect(
      computeEffectiveAgentAuthorization({
        ownerId: "owner_1",
        clientId: "client_1",
        oauthScopes: attentionScope,
        grants: [grant({ resourceSelectors: {} })],
        trustSessions: [],
        now,
      }),
    ).toBeNull();
  });

  it("does not let trust add a capability absent from base grants", () => {
    const result = computeEffectiveAgentAuthorization({
      ownerId: "owner_1",
      clientId: "client_1",
      oauthScopes: ["devos.write.attention", "devos.write.roadmap"],
      grants: [grant()],
      trustSessions: [
        trust({
          capabilities: ["roadmap.write"],
          resourceSelectors: {
            stage: [{ kind: "exact_ids", ids: ["stage_1"] }],
          },
        }),
      ],
      now,
    });

    expect(result?.capabilities).toEqual(["attention.write"]);
    expect(result?.trustSessionIds).toEqual([]);
  });

  it("includes only active, unrevoked and unexhausted trust sessions", () => {
    const result = computeEffectiveAgentAuthorization({
      ownerId: "owner_1",
      clientId: "client_1",
      oauthScopes: attentionScope,
      grants: [grant()],
      trustSessions: [
        trust({ id: "trust_valid" }),
        trust({ id: "trust_expired", expiresAt: now }),
        trust({ id: "trust_revoked", revokedAt: "2026-08-04T19:30:00.000Z" }),
        trust({ id: "trust_exhausted", operationsUsed: 25 }),
      ],
      now,
    });

    expect(result?.trustSessionIds).toEqual(["trust_valid"]);
  });

  it("normalizes duplicate scopes, grants and selectors", () => {
    const duplicated = grant({
      resourceSelectors: {
        attention_item: [
          { kind: "exact_ids", ids: ["attention_1"] },
          { kind: "exact_ids", ids: ["attention_1"] },
        ],
      },
    });

    const result = computeEffectiveAgentAuthorization({
      ownerId: "owner_1",
      clientId: "client_1",
      oauthScopes: [
        "devos.write.attention",
        "devos.write.attention",
      ],
      grants: [duplicated, duplicated],
      trustSessions: [],
      now,
    });

    expect(result?.capabilities).toEqual(["attention.write"]);
    expect(result?.grantIds).toEqual(["grant_attention"]);
    expect(result?.capabilityResourceSelectors["attention.write"]).toEqual({
      attention_item: [
        { kind: "exact_ids", ids: ["attention_1"] },
      ],
    });
  });
});
