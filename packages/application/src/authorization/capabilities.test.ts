import { describe, expect, it } from "vitest";
import {
  agentCapabilities,
  capabilityForCommand,
  oauthScopeForCapability,
} from "./capabilities";

describe("agent capabilities", () => {
  it("keeps the authorization vocabulary closed and deterministic", () => {
    expect(agentCapabilities).toEqual([
      "appearance.write",
      "attention.write",
      "development.request",
      "editorial.publish",
      "editorial.write",
      "growth.review",
      "growth.write",
      "integrations.request",
      "projects.write",
      "roadmap.write",
      "workflow.write",
    ]);
    expect(new Set(agentCapabilities).size).toBe(agentCapabilities.length);
  });

  it.each([
    ["attention.write", "attention.write", "devos.write.attention"],
    ["projects.write", "projects.write", "devos.write.projects"],
    ["roadmap.write", "roadmap.write", "devos.write.roadmap"],
    ["workflow.write", "workflow.write", "devos.write.workflow"],
    ["growth.write", "growth.write", "devos.write.growth"],
    ["growth.review", "growth.review", "devos.write.growth"],
    ["editorial.write", "editorial.write", "devos.write.editorial"],
    ["editorial.publish", "editorial.publish", "devos.write.editorial"],
    ["appearance.write", "appearance.write", "devos.write.appearance"],
    ["integrations.request", "integrations.request", "devos.admin.request"],
    [
      "development.request",
      "development.request",
      "devos.development.request",
    ],
  ] as const)(
    "maps %s without capability inference",
    (commandCapability, expectedCapability, expectedScope) => {
      const capability = capabilityForCommand(commandCapability);
      expect(capability).toBe(expectedCapability);
      expect(oauthScopeForCapability(capability)).toBe(expectedScope);
    },
  );

  it("fails closed for an unknown or administrative-looking capability", () => {
    for (const capability of [
      "*",
      "admin",
      "devos.admin",
      "development.execute",
      "development.request.admin",
      "roadmap.write ",
      "ROADMAP.WRITE",
    ]) {
      expect(() => capabilityForCommand(capability)).toThrow(
        "AGENT_CAPABILITY_UNKNOWN",
      );
    }
  });

  it("does not infer integrations or execution authority from development.request", () => {
    const capability = capabilityForCommand("development.request");
    expect(capability).toBe("development.request");
    expect(capability).not.toBe("integrations.request");
    expect(agentCapabilities).not.toContain("development.execute");
    expect(agentCapabilities).not.toContain("development.admin");
  });
});
