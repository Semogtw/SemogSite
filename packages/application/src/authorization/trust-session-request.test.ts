import { describe, expect, it, vi } from "vitest";
import { planAgentTrustSessionCreation } from "./trust-session-request";
import type {
  AgentCapability,
  EffectiveAgentAuthorization,
  ResourceSelectorMap,
} from "./types";

const selectors: ResourceSelectorMap = {
  attention_item: [{ kind: "exact_ids", ids: ["attention_1"] }],
};

const authorization: EffectiveAgentAuthorization = {
  clientId: "client_1",
  ownerId: "owner_1",
  capabilities: ["attention.write"],
  resourceSelectors: selectors,
  capabilityResourceSelectors: { "attention.write": selectors },
  riskCeiling: "medium",
  riskCeilingByCapability: { "attention.write": "medium" },
  authorizationClauses: [
    {
      grantId: "grant_2",
      capability: "attention.write",
      resourceSelectors: selectors,
      riskCeiling: "medium",
    },
    {
      grantId: "grant_1",
      capability: "attention.write",
      resourceSelectors: selectors,
      riskCeiling: "medium",
    },
  ],
  grantIds: ["grant_2", "grant_1"],
  trustSessionIds: [],
};

const owner = { kind: "owner_ui" as const, actorId: "owner_1" };
const now = "2026-08-04T20:00:00.000Z";

const base = {
  actor: owner,
  trustSessionId: "trust_1",
  baseAuthorization: authorization,
  durationMinutes: 120,
  maxOperations: 25,
  riskCeiling: "medium" as const,
  requestedCapabilities: ["attention.write"] as const,
  requestedResources: selectors,
  now,
  reason: "Permitir uma sessão supervisionada por duas horas.",
};

function accessorArray<T>(getter: () => T): T[] {
  const value: T[] = [];
  Object.defineProperty(value, "0", {
    configurable: true,
    enumerable: true,
    get: getter,
  });
  value.length = 1;
  return value;
}

describe("owner-only trust session creation", () => {
  it("derives client and base grants from effective authorization", () => {
    expect(planAgentTrustSessionCreation(base)).toEqual({
      id: "trust_1",
      ownerId: "owner_1",
      clientId: "client_1",
      baseGrantIds: ["grant_1", "grant_2"],
      capabilities: ["attention.write"],
      resourceSelectors: selectors,
      riskCeiling: "medium",
      startsAt: now,
      expiresAt: "2026-08-04T22:00:00.000Z",
      maxOperations: 25,
      operationsUsed: 0,
      revokedAt: null,
      reason: "Permitir uma sessão supervisionada por duas horas.",
      version: 1,
    });
  });

  it.each([
    { kind: "mcp_client", actorId: "agent_1", clientId: "client_1" },
    { kind: "system", actorId: "system_1" },
    { kind: "external_adapter", actorId: "adapter_1", adapterId: "adapter_1" },
  ] as const)("forbids non-owner trust creation %#", (actor) => {
    expect(() => planAgentTrustSessionCreation({ ...base, actor })).toThrow(
      "TRUST_SESSION_OWNER_REQUIRED",
    );
  });

  it("requires exact owner binding", () => {
    expect(() =>
      planAgentTrustSessionCreation({
        ...base,
        actor: { kind: "owner_ui", actorId: "owner_other" },
      }),
    ).toThrow("TRUST_SESSION_OWNER_MISMATCH");
  });

  it("does not accept client or grant identity overrides", () => {
    const suspicious = {
      ...base,
      clientId: "client_other",
      baseGrantIds: ["grant_other"],
    } as typeof base & { clientId: string; baseGrantIds: string[] };
    expect(planAgentTrustSessionCreation(suspicious)).toMatchObject({
      clientId: "client_1",
      baseGrantIds: ["grant_1", "grant_2"],
    });
  });

  it("delegates capability/resource/risk bounds to trust validation", () => {
    expect(() =>
      planAgentTrustSessionCreation({
        ...base,
        requestedCapabilities: ["roadmap.write"],
        requestedResources: {
          stage: [{ kind: "exact_ids", ids: ["stage_1"] }],
        },
      }),
    ).toThrow("TRUST_CAPABILITY_NOT_GRANTED");

    expect(() =>
      planAgentTrustSessionCreation({
        ...base,
        riskCeiling: "critical" as never,
      }),
    ).toThrow("TRUST_RISK_INVALID");
  });

  it("rejects malformed ID, time or reason", () => {
    for (const input of [
      { trustSessionId: " trust_1" },
      { trustSessionId: "" },
      { trustSessionId: "x".repeat(201) },
      { now: "2026-02-31T20:00:00.000Z" },
      { reason: "" },
      { reason: "x".repeat(501) },
    ]) {
      expect(() =>
        planAgentTrustSessionCreation({ ...base, ...input }),
      ).toThrow("TRUST_SESSION_REQUEST_INVALID");
    }
  });

  it("rejects unsafe expiration arithmetic", () => {
    expect(() =>
      planAgentTrustSessionCreation({
        ...base,
        now: "9999-12-31T23:59:59.999Z",
        durationMinutes: 480,
      }),
    ).toThrow("TRUST_SESSION_REQUEST_INVALID");
  });

  it("rejects hostile base authorization arrays without invoking them", () => {
    const getter = vi.fn(() => "attention.write" as AgentCapability);

    expect(() =>
      planAgentTrustSessionCreation({
        ...base,
        baseAuthorization: {
          ...authorization,
          capabilities: accessorArray(getter),
        },
      }),
    ).toThrow("TRUST_SESSION_REQUEST_INVALID");
    expect(getter).not.toHaveBeenCalled();
  });

  it("copies requested selectors without invoking caller iterators", () => {
    const iteratorGetter = vi.fn(() => {
      throw new Error("caller iterator must not run");
    });
    const ids = ["attention_1"];
    Object.defineProperty(ids, Symbol.iterator, {
      configurable: true,
      get: iteratorGetter,
    });

    const planned = planAgentTrustSessionCreation({
      ...base,
      requestedResources: {
        attention_item: [{ kind: "exact_ids", ids }],
      },
    });

    expect(planned.resourceSelectors).toEqual({
      attention_item: [{ kind: "exact_ids", ids: ["attention_1"] }],
    });
    expect(iteratorGetter).not.toHaveBeenCalled();
  });
});
