import { describe, expect, it, vi } from "vitest";
import { computeEffectiveAgentAuthorization } from "./effective-grant";
import type {
  AgentCapability,
  AgentGrantDefinition,
  AgentTrustSession,
  OAuthScope,
  ResourceSelector,
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

function poisonMethod<T extends unknown[]>(
  value: T,
  method: "filter" | "some" | "flatMap",
): ReturnType<typeof vi.fn> {
  const poisoned = vi.fn(() => {
    throw new Error(`caller ${method} must not run`);
  });
  Object.defineProperty(value, method, {
    configurable: true,
    value: poisoned,
  });
  return poisoned;
}

describe("effective authorization public boundaries", () => {
  it("rejects OAuth scope accessors without invoking them", () => {
    const getter = vi.fn(() => "devos.write.attention" as OAuthScope);

    expect(
      computeEffectiveAgentAuthorization({
        ownerId: "owner_1",
        clientId: "client_1",
        oauthScopes: accessorArray(getter),
        grants: [grant()],
        trustSessions: [],
        now,
      }),
    ).toBeNull();
    expect(getter).not.toHaveBeenCalled();
  });

  it("rejects grant accessors without invoking them", () => {
    const getter = vi.fn(() => grant());

    expect(
      computeEffectiveAgentAuthorization({
        ownerId: "owner_1",
        clientId: "client_1",
        oauthScopes: ["devos.write.attention"],
        grants: accessorArray(getter),
        trustSessions: [],
        now,
      }),
    ).toBeNull();
    expect(getter).not.toHaveBeenCalled();
  });

  it("ignores trust-session accessors without invoking them", () => {
    const getter = vi.fn(() => trust());

    expect(
      computeEffectiveAgentAuthorization({
        ownerId: "owner_1",
        clientId: "client_1",
        oauthScopes: ["devos.write.attention"],
        grants: [grant()],
        trustSessions: accessorArray(getter),
        now,
      }),
    ).toMatchObject({
      capabilities: ["attention.write"],
      grantIds: ["grant_attention"],
      trustSessionIds: [],
    });
    expect(getter).not.toHaveBeenCalled();
  });

  it("uses canonical grant copies without invoking caller methods", () => {
    const candidate = grant();
    const capabilitySome = poisonMethod(
      candidate.capabilities as AgentCapability[],
      "some",
    );
    const capabilityFlatMap = poisonMethod(
      candidate.capabilities as AgentCapability[],
      "flatMap",
    );
    const selectorSome = poisonMethod(
      candidate.resourceSelectors.attention_item as ResourceSelector[],
      "some",
    );
    const grants = [candidate];
    const scopes = ["devos.write.attention"] as OAuthScope[];
    const grantsFilter = poisonMethod(grants, "filter");
    const scopesFilter = poisonMethod(scopes, "filter");

    const result = computeEffectiveAgentAuthorization({
      ownerId: "owner_1",
      clientId: "client_1",
      oauthScopes: scopes,
      grants,
      trustSessions: [],
      now,
    });

    expect(result).toMatchObject({
      capabilities: ["attention.write"],
      grantIds: ["grant_attention"],
    });
    expect(grantsFilter).not.toHaveBeenCalled();
    expect(scopesFilter).not.toHaveBeenCalled();
    expect(capabilitySome).not.toHaveBeenCalled();
    expect(capabilityFlatMap).not.toHaveBeenCalled();
    expect(selectorSome).not.toHaveBeenCalled();
  });
});
