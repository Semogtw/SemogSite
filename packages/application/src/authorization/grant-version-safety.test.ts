import { describe, expect, it } from "vitest";
import { planAgentGrantStatusTransition } from "./grant-lifecycle";
import type { AgentGrantDefinition } from "./types";

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
  version: Number.MAX_SAFE_INTEGER,
};

describe("agent grant optimistic version safety", () => {
  it("rejects a transition whose next version would be unsafe", () => {
    expect(() =>
      planAgentGrantStatusTransition({
        actor: { kind: "owner_ui", actorId: "owner_1" },
        grant,
        targetStatus: "suspended",
        now: "2026-08-05T07:30:00.000Z",
        reason: "Pause access.",
      }),
    ).toThrow("AGENT_GRANT_TRANSITION_INVALID");
  });
});
