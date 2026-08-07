import { describe, expect, it } from "vitest";
import catalogJson from "../editability-catalog.json";
import { validateAgentAuthorizationCatalog } from "./catalog-coverage";

describe("agent authorization catalog coverage", () => {
  it("classifies every currently registered command", () => {
    expect(
      validateAgentAuthorizationCatalog(catalogJson.commands),
    ).toEqual([
      {
        commandId: "attention.transition",
        commandVersion: 1,
        capability: "attention.write",
        resourceType: "attention_item",
      },
      {
        commandId: "roadmap.stages.complete",
        commandVersion: 1,
        capability: "roadmap.write",
        resourceType: "stage",
      },
    ]);
  });

  it("rejects an unknown capability", () => {
    expect(() =>
      validateAgentAuthorizationCatalog([
        {
          commandId: "attention.transition",
          commandVersion: 1,
          capability: "attention.admin",
          resourceType: "attention_item",
        },
      ]),
    ).toThrow("AGENT_CAPABILITY_UNKNOWN");
  });

  it("rejects a resource kind not reviewed for the capability", () => {
    expect(() =>
      validateAgentAuthorizationCatalog([
        {
          commandId: "attention.transition",
          commandVersion: 1,
          capability: "attention.write",
          resourceType: "stage",
        },
      ]),
    ).toThrow("AGENT_CAPABILITY_RESOURCE_KIND_MISMATCH");
  });

  it("rejects duplicate command IDs and versions", () => {
    const command = {
      commandId: "attention.transition",
      commandVersion: 1,
      capability: "attention.write",
      resourceType: "attention_item",
    };
    expect(() =>
      validateAgentAuthorizationCatalog([command, command]),
    ).toThrow("AGENT_AUTHORIZATION_COMMAND_DUPLICATE");
  });

  it("rejects malformed entries before reading capability metadata", () => {
    for (const value of [
      null,
      {},
      { commandId: " attention.transition", commandVersion: 1 },
      {
        commandId: "attention.transition",
        commandVersion: 0,
        capability: "attention.write",
        resourceType: "attention_item",
      },
    ]) {
      expect(() =>
        validateAgentAuthorizationCatalog([value] as never),
      ).toThrow("AGENT_AUTHORIZATION_COMMAND_INVALID");
    }
  });
});
