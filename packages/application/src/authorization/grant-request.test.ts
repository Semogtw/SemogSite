import { describe, expect, it } from "vitest";
import { validateAgentGrantRequest } from "./grant-request";

const baseRequest = {
  ownerId: "owner_1",
  clientId: "client_1",
  profileId: null,
  capabilities: ["attention.write"] as const,
  resourceSelectors: {
    attention_item: [{ kind: "exact_ids" as const, ids: ["attention_1"] }],
  },
  riskCeiling: "medium" as const,
  expiresAt: null,
  reason: "Permitir manutenção supervisionada da fila de atenção.",
};

const ownerActor = {
  kind: "owner_ui" as const,
  actorId: "owner_1",
};

describe("owner-only agent grant requests", () => {
  it("accepts a bounded explicit grant request from the owner", () => {
    expect(
      validateAgentGrantRequest({
        actor: ownerActor,
        request: baseRequest,
        now: "2026-08-04T20:00:00.000Z",
        explicitAllResourceKinds: [],
      }),
    ).toEqual(baseRequest);
  });

  it.each([
    { kind: "mcp_client", actorId: "agent_1", clientId: "client_1" },
    { kind: "system", actorId: "system_1" },
    { kind: "external_adapter", actorId: "adapter_1", adapterId: "adapter_1" },
  ] as const)("forbids non-owner grant management %#", (actor) => {
    expect(() =>
      validateAgentGrantRequest({
        actor,
        request: baseRequest,
        now: "2026-08-04T20:00:00.000Z",
        explicitAllResourceKinds: [],
      }),
    ).toThrow("AGENT_GRANT_OWNER_REQUIRED");
  });

  it("requires the authenticated owner to match the grant owner", () => {
    expect(() =>
      validateAgentGrantRequest({
        actor: { kind: "owner_ui", actorId: "owner_other" },
        request: baseRequest,
        now: "2026-08-04T20:00:00.000Z",
        explicitAllResourceKinds: [],
      }),
    ).toThrow("AGENT_GRANT_OWNER_MISMATCH");
  });

  it("requires every capability to have a reviewed selector", () => {
    expect(() =>
      validateAgentGrantRequest({
        actor: ownerActor,
        request: {
          ...baseRequest,
          capabilities: ["attention.write", "roadmap.write"],
        },
        now: "2026-08-04T20:00:00.000Z",
        explicitAllResourceKinds: [],
      }),
    ).toThrow("AGENT_GRANT_RESOURCE_SELECTOR_MISSING");
  });

  it("rejects selectors unrelated to the requested capabilities", () => {
    expect(() =>
      validateAgentGrantRequest({
        actor: ownerActor,
        request: {
          ...baseRequest,
          resourceSelectors: {
            ...baseRequest.resourceSelectors,
            stage: [{ kind: "exact_ids", ids: ["stage_1"] }],
          },
        },
        now: "2026-08-04T20:00:00.000Z",
        explicitAllResourceKinds: [],
      }),
    ).toThrow("AGENT_GRANT_RESOURCE_KIND_NOT_ALLOWED");
  });

  it("requires explicit owner selection for all", () => {
    const request = {
      ...baseRequest,
      resourceSelectors: { attention_item: [{ kind: "all" as const }] },
    };
    expect(() =>
      validateAgentGrantRequest({
        actor: ownerActor,
        request,
        now: "2026-08-04T20:00:00.000Z",
        explicitAllResourceKinds: [],
      }),
    ).toThrow("ALL_SELECTOR_REQUIRES_OWNER_SELECTION");

    expect(
      validateAgentGrantRequest({
        actor: ownerActor,
        request,
        now: "2026-08-04T20:00:00.000Z",
        explicitAllResourceKinds: ["attention_item"],
      }),
    ).toEqual(request);
  });

  it("rejects unknown, duplicate or empty capabilities", () => {
    for (const capabilities of [
      [],
      ["attention.write", "attention.write"],
      ["admin.write"],
    ]) {
      expect(() =>
        validateAgentGrantRequest({
          actor: ownerActor,
          request: { ...baseRequest, capabilities } as never,
          now: "2026-08-04T20:00:00.000Z",
          explicitAllResourceKinds: [],
        }),
      ).toThrow("AGENT_GRANT_CAPABILITY_INVALID");
    }
  });

  it("never accepts critical as a grant ceiling", () => {
    expect(() =>
      validateAgentGrantRequest({
        actor: ownerActor,
        request: { ...baseRequest, riskCeiling: "critical" as never },
        now: "2026-08-04T20:00:00.000Z",
        explicitAllResourceKinds: [],
      }),
    ).toThrow("AGENT_GRANT_RISK_INVALID");
  });

  it("requires expiry to be canonical and in the future", () => {
    for (const expiresAt of [
      "not-a-time",
      "2026-02-31T20:00:00.000Z",
      "2026-08-04T20:00:00.000Z",
      "2026-08-04T19:59:59.999Z",
    ]) {
      expect(() =>
        validateAgentGrantRequest({
          actor: ownerActor,
          request: { ...baseRequest, expiresAt },
          now: "2026-08-04T20:00:00.000Z",
          explicitAllResourceKinds: [],
        }),
      ).toThrow("AGENT_GRANT_EXPIRY_INVALID");
    }
  });

  it("rejects malformed identity, profile or reason fields", () => {
    for (const request of [
      { ...baseRequest, ownerId: " owner_1" },
      { ...baseRequest, clientId: "" },
      { ...baseRequest, profileId: " profile_1" },
      { ...baseRequest, reason: "" },
      { ...baseRequest, reason: "x".repeat(501) },
    ]) {
      expect(() =>
        validateAgentGrantRequest({
          actor: ownerActor,
          request,
          now: "2026-08-04T20:00:00.000Z",
          explicitAllResourceKinds: [],
        }),
      ).toThrow("AGENT_GRANT_REQUEST_INVALID");
    }
  });
});
