import { describe, expect, it } from "vitest";
import { domainForCapability } from "./capabilities";

it.each([
  ["appearance.write", "appearance"],
  ["attention.write", "attention"],
  ["development.request", "development"],
  ["editorial.publish", "editorial"],
  ["editorial.write", "editorial"],
  ["growth.review", "growth"],
  ["growth.write", "growth"],
  ["integrations.request", "integrations"],
  ["projects.write", "projects"],
  ["roadmap.write", "roadmap"],
  ["workflow.write", "workflow"],
] as const)("maps %s to domain %s", (capability, domain) => {
  expect(domainForCapability(capability)).toBe(domain);
});

describe("agent capability domains", () => {
  it("never maps to an administrative wildcard domain", () => {
    expect(() => domainForCapability("admin" as never)).toThrow(
      "AGENT_CAPABILITY_UNKNOWN",
    );
  });
});
