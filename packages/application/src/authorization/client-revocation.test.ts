import { describe, expect, it } from "vitest";
import { planAgentClientRevocation } from "./client-revocation";

const owner = { kind: "owner_ui" as const, actorId: "owner_1" };
const now = "2026-08-04T20:00:00.000Z";

const base = {
  actor: owner,
  ownerId: "owner_1",
  clientId: "client_1",
  expectedClientVersion: 4,
  activeGrantIds: ["grant_b", "grant_a"],
  activeTrustSessionIds: ["trust_2", "trust_1"],
  pendingChallengeIds: ["challenge_2", "challenge_1"],
  now,
  reason: "Desconectar a integração e encerrar toda autorização derivada.",
};

describe("agent client revocation planning", () => {
  it("plans a deterministic optimistic cascade", () => {
    expect(planAgentClientRevocation(base)).toEqual({
      ownerId: "owner_1",
      clientId: "client_1",
      expectedClientVersion: 4,
      nextClientVersion: 5,
      revokeGrantIds: ["grant_a", "grant_b"],
      revokeTrustSessionIds: ["trust_1", "trust_2"],
      cancelChallengeIds: ["challenge_1", "challenge_2"],
      revokedAt: now,
      reason: "Desconectar a integração e encerrar toda autorização derivada.",
    });
  });

  it("allows an empty cascade while still revoking the client", () => {
    expect(
      planAgentClientRevocation({
        ...base,
        activeGrantIds: [],
        activeTrustSessionIds: [],
        pendingChallengeIds: [],
      }),
    ).toMatchObject({
      revokeGrantIds: [],
      revokeTrustSessionIds: [],
      cancelChallengeIds: [],
    });
  });

  it.each([
    { kind: "mcp_client", actorId: "agent_1", clientId: "client_1" },
    { kind: "system", actorId: "system_1" },
    { kind: "external_adapter", actorId: "adapter_1", adapterId: "adapter_1" },
  ] as const)("forbids non-owner revocation %#", (actor) => {
    expect(() => planAgentClientRevocation({ ...base, actor })).toThrow(
      "AGENT_CLIENT_REVOCATION_OWNER_REQUIRED",
    );
  });

  it("requires exact owner binding", () => {
    expect(() =>
      planAgentClientRevocation({
        ...base,
        actor: { kind: "owner_ui", actorId: "owner_other" },
      }),
    ).toThrow("AGENT_CLIENT_REVOCATION_OWNER_MISMATCH");
  });

  it("rejects duplicate or malformed cascade IDs", () => {
    for (const input of [
      { activeGrantIds: ["grant_1", "grant_1"] },
      { activeTrustSessionIds: [" trust_1"] },
      { pendingChallengeIds: [""] },
      { activeGrantIds: ["x".repeat(201)] },
    ]) {
      expect(() =>
        planAgentClientRevocation({ ...base, ...input }),
      ).toThrow("AGENT_CLIENT_REVOCATION_INVALID");
    }
  });

  it("rejects malformed identity, version, time or reason", () => {
    for (const input of [
      { ownerId: " owner_1" },
      { clientId: "" },
      { expectedClientVersion: 0 },
      { expectedClientVersion: Number.MAX_SAFE_INTEGER },
      { now: "2026-02-31T20:00:00.000Z" },
      { reason: "" },
      { reason: "x".repeat(501) },
    ]) {
      expect(() =>
        planAgentClientRevocation({ ...base, ...input }),
      ).toThrow("AGENT_CLIENT_REVOCATION_INVALID");
    }
  });
});
