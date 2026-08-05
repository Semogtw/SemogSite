import { describe, expect, it, vi } from "vitest";
import { validateAgentGrantRequest } from "./grant-request";
import { planAgentTrustSessionCreation } from "./trust-session-request";
import type {
  AgentCapability,
  EffectiveAgentAuthorization,
} from "./types";

const owner = { kind: "owner_ui" as const, actorId: "owner_1" };
const now = "2026-08-05T13:00:00.000Z";
const request = {
  ownerId: "owner_1",
  clientId: "client_1",
  profileId: null,
  capabilities: ["attention.write"] as const,
  resourceSelectors: {
    attention_item: [{ kind: "exact_ids" as const, ids: ["attention_1"] }],
  },
  riskCeiling: "medium" as const,
  expiresAt: null,
  reason: "Allow supervised attention maintenance.",
};

const authorization: EffectiveAgentAuthorization = {
  clientId: "client_1",
  ownerId: "owner_1",
  capabilities: ["attention.write"],
  resourceSelectors: request.resourceSelectors,
  capabilityResourceSelectors: {
    "attention.write": request.resourceSelectors,
  },
  riskCeiling: "medium",
  riskCeilingByCapability: { "attention.write": "medium" },
  authorizationClauses: [
    {
      grantId: "grant_1",
      capability: "attention.write",
      resourceSelectors: request.resourceSelectors,
      riskCeiling: "medium",
    },
  ],
  grantIds: ["grant_1"],
  trustSessionIds: [],
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

describe("authorization array boundaries", () => {
  it("rejects sparse grant capabilities", () => {
    expect(() =>
      validateAgentGrantRequest({
        actor: owner,
        request: {
          ...request,
          capabilities: new Array(1) as AgentCapability[],
        },
        now,
        explicitAllResourceKinds: [],
      }),
    ).toThrow("AGENT_GRANT_CAPABILITY_INVALID");
  });

  it("rejects capability accessors without invoking them", () => {
    const getter = vi.fn(() => "attention.write" as const);

    expect(() =>
      validateAgentGrantRequest({
        actor: owner,
        request: {
          ...request,
          capabilities: accessorArray(getter),
        },
        now,
        explicitAllResourceKinds: [],
      }),
    ).toThrow("AGENT_GRANT_CAPABILITY_INVALID");
    expect(getter).not.toHaveBeenCalled();
  });

  it("rejects explicit-resource accessors without invoking them", () => {
    const getter = vi.fn(() => "attention_item");

    expect(() =>
      validateAgentGrantRequest({
        actor: owner,
        request,
        now,
        explicitAllResourceKinds: accessorArray(getter),
      }),
    ).toThrow("AGENT_GRANT_REQUEST_INVALID");
    expect(getter).not.toHaveBeenCalled();
  });

  it("rejects sparse base-grant IDs before trust planning", () => {
    expect(() =>
      planAgentTrustSessionCreation({
        actor: owner,
        trustSessionId: "trust_1",
        baseAuthorization: {
          ...authorization,
          grantIds: new Array(1) as string[],
        },
        durationMinutes: 60,
        maxOperations: 10,
        riskCeiling: "medium",
        requestedCapabilities: ["attention.write"],
        requestedResources: request.resourceSelectors,
        now,
        reason: "Supervised maintenance window.",
      }),
    ).toThrow("TRUST_SESSION_REQUEST_INVALID");
  });

  it("rejects base-grant accessors without invoking them", () => {
    const getter = vi.fn(() => "grant_1");

    expect(() =>
      planAgentTrustSessionCreation({
        actor: owner,
        trustSessionId: "trust_1",
        baseAuthorization: {
          ...authorization,
          grantIds: accessorArray(getter),
        },
        durationMinutes: 60,
        maxOperations: 10,
        riskCeiling: "medium",
        requestedCapabilities: ["attention.write"],
        requestedResources: request.resourceSelectors,
        now,
        reason: "Supervised maintenance window.",
      }),
    ).toThrow("TRUST_SESSION_REQUEST_INVALID");
    expect(getter).not.toHaveBeenCalled();
  });
});
