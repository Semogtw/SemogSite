import { describe, expect, it, vi } from "vitest";
import { planAgentGrantCreation } from "./grant-creation";
import { planAgentGrantRevision } from "./grant-revision";
import type { AgentGrantRequest } from "./grant-request";
import type { AgentGrantDefinition } from "./types";

const actor = { kind: "owner_ui" as const, actorId: "owner_1" };
const now = "2026-08-05T14:00:00.000Z";

function request(ids: string[]): AgentGrantRequest {
  return {
    ownerId: "owner_1",
    clientId: "client_1",
    profileId: null,
    capabilities: ["attention.write"],
    resourceSelectors: {
      attention_item: [{ kind: "exact_ids", ids }],
    },
    riskCeiling: "medium",
    expiresAt: null,
    reason: "Authorize supervised maintenance.",
  };
}

const grant: AgentGrantDefinition = {
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
  version: 2,
};

function poisonedIds(): { ids: string[]; iteratorGetter: ReturnType<typeof vi.fn> } {
  const iteratorGetter = vi.fn(() => {
    throw new Error("caller iterator must not run");
  });
  const ids = ["attention_2", "attention_1"];
  Object.defineProperty(ids, Symbol.iterator, {
    configurable: true,
    get: iteratorGetter,
  });
  return { ids, iteratorGetter };
}

describe("grant selector copy boundary", () => {
  it("creates grants without invoking nested caller iterators", () => {
    const { ids, iteratorGetter } = poisonedIds();

    expect(
      planAgentGrantCreation({
        actor,
        grantId: "grant_1",
        request: request(ids),
        explicitAllResourceKinds: [],
        now,
      }).grant.resourceSelectors,
    ).toEqual({
      attention_item: [
        { kind: "exact_ids", ids: ["attention_1", "attention_2"] },
      ],
    });
    expect(iteratorGetter).not.toHaveBeenCalled();
  });

  it("revises grants without invoking nested caller iterators", () => {
    const { ids, iteratorGetter } = poisonedIds();

    expect(
      planAgentGrantRevision({
        actor,
        grant,
        request: request(ids),
        explicitAllResourceKinds: [],
        activeTrustSessionIds: [],
        now,
      }).nextGrant.resourceSelectors,
    ).toEqual({
      attention_item: [
        { kind: "exact_ids", ids: ["attention_1", "attention_2"] },
      ],
    });
    expect(iteratorGetter).not.toHaveBeenCalled();
  });
});
