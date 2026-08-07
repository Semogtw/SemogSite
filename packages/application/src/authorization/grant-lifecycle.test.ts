import { describe, expect, it } from "vitest";
import {
  evaluateAgentGrantState,
  planAgentGrantStatusTransition,
} from "./grant-lifecycle";
import type { AgentGrantDefinition } from "./types";

function grant(
  overrides: Partial<AgentGrantDefinition> = {},
): AgentGrantDefinition {
  return {
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
    version: 3,
    ...overrides,
  };
}

const owner = { kind: "owner_ui" as const, actorId: "owner_1" };
const now = "2026-08-04T20:00:00.000Z";

describe("agent grant runtime state", () => {
  it.each([
    [grant(), "active"],
    [grant({ status: "suspended" }), "suspended"],
    [grant({ status: "revoked" }), "revoked"],
    [grant({ status: "expired" }), "expired"],
    [grant({ expiresAt: now }), "expired"],
    [grant({ expiresAt: "2026-08-04T19:59:59.999Z" }), "expired"],
  ] as const)("evaluates %# as %s", (candidate, expected) => {
    expect(evaluateAgentGrantState(candidate, now)).toBe(expected);
  });

  it.each([
    grant({ id: " grant_1" }),
    grant({ ownerId: "" }),
    grant({ clientId: " client_1" }),
    grant({ profileId: " profile_1" }),
    grant({ status: "deleted" as never }),
    grant({ riskCeiling: "critical" as never }),
    grant({ expiresAt: "not-a-time" }),
    grant({ version: 0 }),
    grant({ capabilities: [] }),
    grant({ capabilities: ["attention.write", "attention.write"] }),
  ])("fails closed for malformed grant %#", (candidate) => {
    expect(evaluateAgentGrantState(candidate, now)).toBe("invalid");
  });

  it("fails closed for a malformed current time", () => {
    expect(evaluateAgentGrantState(grant(), "2026-02-31T20:00:00.000Z")).toBe(
      "invalid",
    );
  });
});

describe("agent grant status transition planning", () => {
  it("plans suspension with optimistic version binding", () => {
    expect(
      planAgentGrantStatusTransition({
        actor: owner,
        grant: grant(),
        targetStatus: "suspended",
        now,
        reason: "Pausar acesso enquanto a integração é revisada.",
      }),
    ).toEqual({
      grantId: "grant_1",
      ownerId: "owner_1",
      clientId: "client_1",
      fromStatus: "active",
      toStatus: "suspended",
      expectedVersion: 3,
      nextVersion: 4,
      changedAt: now,
      reason: "Pausar acesso enquanto a integração é revisada.",
    });
  });

  it("plans reactivation only from suspended", () => {
    expect(
      planAgentGrantStatusTransition({
        actor: owner,
        grant: grant({ status: "suspended" }),
        targetStatus: "active",
        now,
        reason: "Reativar após revisão concluída.",
      }),
    ).toMatchObject({ fromStatus: "suspended", toStatus: "active" });

    expect(() =>
      planAgentGrantStatusTransition({
        actor: owner,
        grant: grant(),
        targetStatus: "active",
        now,
        reason: "Não há transição.",
      }),
    ).toThrow("AGENT_GRANT_TRANSITION_INVALID");
  });

  it("allows revocation from active or suspended and treats it as terminal", () => {
    for (const status of ["active", "suspended"] as const) {
      expect(
        planAgentGrantStatusTransition({
          actor: owner,
          grant: grant({ status }),
          targetStatus: "revoked",
          now,
          reason: "Revogar permanentemente esta concessão.",
        }),
      ).toMatchObject({ fromStatus: status, toStatus: "revoked" });
    }

    for (const status of ["revoked", "expired"] as const) {
      expect(() =>
        planAgentGrantStatusTransition({
          actor: owner,
          grant: grant({ status }),
          targetStatus: "suspended",
          now,
          reason: "Transição inválida.",
        }),
      ).toThrow("AGENT_GRANT_TERMINAL");
    }
  });

  it.each([
    { kind: "mcp_client", actorId: "agent_1", clientId: "client_1" },
    { kind: "system", actorId: "system_1" },
    { kind: "external_adapter", actorId: "adapter_1", adapterId: "adapter_1" },
  ] as const)("forbids non-owner transitions %#", (actor) => {
    expect(() =>
      planAgentGrantStatusTransition({
        actor,
        grant: grant(),
        targetStatus: "suspended",
        now,
        reason: "Tentativa de autoelevação.",
      }),
    ).toThrow("AGENT_GRANT_OWNER_REQUIRED");
  });

  it("requires the authenticated owner to match the grant owner", () => {
    expect(() =>
      planAgentGrantStatusTransition({
        actor: { kind: "owner_ui", actorId: "owner_other" },
        grant: grant(),
        targetStatus: "suspended",
        now,
        reason: "Owner incorreto.",
      }),
    ).toThrow("AGENT_GRANT_OWNER_MISMATCH");
  });

  it("rejects expired, malformed or non-canonical transition material", () => {
    expect(() =>
      planAgentGrantStatusTransition({
        actor: owner,
        grant: grant({ expiresAt: now }),
        targetStatus: "suspended",
        now,
        reason: "Já expirou.",
      }),
    ).toThrow("AGENT_GRANT_TERMINAL");

    for (const input of [
      { targetStatus: "expired" as never, reason: "Inválido." },
      { targetStatus: "suspended" as const, reason: "" },
      { targetStatus: "suspended" as const, reason: "x".repeat(501) },
      {
        targetStatus: "suspended" as const,
        reason: "Tempo inválido.",
        now: "2026-02-31T20:00:00.000Z",
      },
    ]) {
      expect(() =>
        planAgentGrantStatusTransition({
          actor: owner,
          grant: grant(),
          targetStatus: input.targetStatus,
          now: input.now ?? now,
          reason: input.reason,
        }),
      ).toThrow("AGENT_GRANT_TRANSITION_INVALID");
    }
  });
});
