import { describe, expect, it } from "vitest";
import {
  AssistanceAvailabilitySchema,
  AssistanceOriginSchema,
} from "./assistance";

describe("AssistanceOriginSchema", () => {
  it("accepts manual, deterministic and template origins", () => {
    expect(AssistanceOriginSchema.parse({ kind: "manual" })).toEqual({
      kind: "manual",
    });
    expect(
      AssistanceOriginSchema.parse({
        kind: "deterministic_rule",
        ruleId: "equal-checkpoint-weights",
        ruleVersion: 1,
      }),
    ).toEqual({
      kind: "deterministic_rule",
      ruleId: "equal-checkpoint-weights",
      ruleVersion: 1,
    });
    expect(
      AssistanceOriginSchema.parse({
        kind: "template",
        templateId: "learn_programming_language",
        templateVersion: 1,
      }),
    ).toEqual({
      kind: "template",
      templateId: "learn_programming_language",
      templateVersion: 1,
    });
  });

  it("accepts authenticated external and configured internal model metadata", () => {
    expect(
      AssistanceOriginSchema.parse({
        kind: "external_ai_client",
        clientId: "client-1",
        declaredProvider: "OpenAI",
        declaredModel: "GPT",
      }),
    ).toMatchObject({
      kind: "external_ai_client",
      clientId: "client-1",
    });
    expect(
      AssistanceOriginSchema.parse({
        kind: "internal_model_provider",
        providerId: "provider-1",
        modelId: "model-1",
      }),
    ).toEqual({
      kind: "internal_model_provider",
      providerId: "provider-1",
      modelId: "model-1",
    });
  });

  it("rejects empty identities, invalid versions and unknown fields", () => {
    expect(() =>
      AssistanceOriginSchema.parse({
        kind: "external_ai_client",
        clientId: "",
        declaredProvider: null,
        declaredModel: null,
      }),
    ).toThrow();
    expect(() =>
      AssistanceOriginSchema.parse({
        kind: "template",
        templateId: "template",
        templateVersion: 0,
      }),
    ).toThrow();
    expect(() =>
      AssistanceOriginSchema.parse({ kind: "manual", model: "fake" }),
    ).toThrow();
  });
});

describe("AssistanceAvailabilitySchema", () => {
  it("keeps deterministic assistance permanently available without AI", () => {
    expect(
      AssistanceAvailabilitySchema.parse({
        deterministic: true,
        externalAiConnected: false,
        internalProviderConfigured: false,
      }),
    ).toEqual({
      deterministic: true,
      externalAiConnected: false,
      internalProviderConfigured: false,
    });
  });

  it("rejects a state that disables deterministic assistance", () => {
    expect(() =>
      AssistanceAvailabilitySchema.parse({
        deterministic: false,
        externalAiConnected: false,
        internalProviderConfigured: false,
      }),
    ).toThrow();
  });
});
