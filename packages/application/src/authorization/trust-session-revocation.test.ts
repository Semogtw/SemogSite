import { describe, expect, it } from "vitest";
import { planAgentTrustSessionRevocation } from "./trust-session-revocation";
import type { AgentTrustSession } from "./types";

const now = "2026-08-05T06:00:00.000Z";
const session: AgentTrustSession = {
  id: "trust_1",
  ownerId: "owner_1",
  clientId: "client_1",
  baseGrantIds: ["grant_1"],
  capabilities: ["attention.write"],
  resourceSelectors: {
    attention_item: [{ kind: "exact_ids", ids: ["attention_1"] }],
  },
  riskCeiling: "medium",
  startsAt: "2026-08-05T05:00:00.000Z",
  expiresAt: "2026-08-05T07:00:00.000Z",
  maxOperations: 25,
  operationsUsed: 4,
  revokedAt: null,
  reason: "Supervised maintenance window.",
  version: 3,
};

const owner = { kind: "owner_ui" as const, actorId: "owner_1" };

describe("owner-only trust session revocation", () => {
  it("plans an optimistic versioned revocation", () => {
    expect(
      planAgentTrustSessionRevocation({
        actor: owner,
        session,
        now,
        reason: "The supervised work is complete.",
      }),
    ).toEqual({
      trustSessionId: "trust_1",
      ownerId: "owner_1",
      clientId: "client_1",
      expectedVersion: 3,
      nextVersion: 4,
      revokedAt: now,
      reason: "The supervised work is complete.",
    });
  });

  it.each([
    { kind: "mcp_client", actorId: "agent_1", clientId: "client_1" },
    { kind: "system", actorId: "system_1" },
    { kind: "external_adapter", actorId: "adapter_1", adapterId: "adapter_1" },
  ] as const)("forbids non-owner revocation %#", (actor) => {
    expect(() =>
      planAgentTrustSessionRevocation({
        actor,
        session,
        now,
        reason: "Stop the session.",
      }),
    ).toThrow("TRUST_SESSION_REVOCATION_OWNER_REQUIRED");
  });

  it("requires exact owner binding", () => {
    expect(() =>
      planAgentTrustSessionRevocation({
        actor: { kind: "owner_ui", actorId: "owner_other" },
        session,
        now,
        reason: "Stop the session.",
      }),
    ).toThrow("TRUST_SESSION_REVOCATION_OWNER_MISMATCH");
  });

  it("returns no write plan when the session is already revoked", () => {
    expect(
      planAgentTrustSessionRevocation({
        actor: owner,
        session: { ...session, revokedAt: "2026-08-05T05:30:00.000Z" },
        now,
        reason: "Repeat the same revocation request.",
      }),
    ).toBeNull();
  });

  it("rejects malformed identity, version, timestamp or reason", () => {
    for (const input of [
      { session: { ...session, id: " trust_1" } },
      { session: { ...session, ownerId: "" } },
      { session: { ...session, clientId: "x".repeat(201) } },
      { session: { ...session, version: 0 } },
      { session: { ...session, version: Number.MAX_SAFE_INTEGER } },
      { now: "2026-02-31T06:00:00.000Z" },
      { reason: "" },
      { reason: "x".repeat(501) },
    ]) {
      expect(() =>
        planAgentTrustSessionRevocation({
          actor: owner,
          session,
          now,
          reason: "Stop the session.",
          ...input,
        }),
      ).toThrow("TRUST_SESSION_REVOCATION_INVALID");
    }
  });
});
