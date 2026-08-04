import { describe, expect, it } from "vitest";
import * as application from "./index";

describe("@semogtw/application public surface", () => {
  it("exports the framework-free command foundation and registered pilots", () => {
    expect(application).toMatchObject({
      canonicalJson: expect.any(Function),
      canonicalSha256: expect.any(Function),
      isCanonicalUtcTimestamp: expect.any(Function),
      CommandGateway: expect.any(Function),
      CommandRegistry: expect.any(Function),
      OwnerBrowserPolicy: expect.any(Function),
      createReceiptClaim: expect.any(Function),
      transitionAttentionCommand: expect.objectContaining({
        commandId: "attention.transition",
      }),
      completeStageCommand: expect.objectContaining({
        commandId: "roadmap.stages.complete",
        execution: "registered_blocked",
      }),
      validateEditabilityCoverage: expect.any(Function),
      listOwnerEntityActions: expect.any(Function),
    });
  });

  it("exports provider-neutral agent authorization contracts", () => {
    expect(application).toMatchObject({
      agentCapabilities: expect.arrayContaining([
        "attention.write",
        "roadmap.write",
        "development.request",
      ]),
      capabilityForCommand: expect.any(Function),
      oauthScopeForCapability: expect.any(Function),
      resourceKindsForCapability: expect.any(Function),
      validateResourceSelectorForKind: expect.any(Function),
      selectorMatchesResource: expect.any(Function),
      computeEffectiveAgentAuthorization: expect.any(Function),
      validateTrustSessionRequest: expect.any(Function),
      evaluateTrustSessionState: expect.any(Function),
      trustSessionFitsAuthorization: expect.any(Function),
      trustSessionCoversCommand: expect.any(Function),
      writesAllowed: expect.any(Function),
      createConfirmationChallengeService: expect.any(Function),
      decideAgentCommandDisposition: expect.any(Function),
      minimumTrustDurationMinutes: 5,
      defaultTrustDurationMinutes: 120,
      maximumTrustDurationMinutes: 480,
      defaultTrustMaximumOperations: 25,
      maximumTrustOperations: 100,
      confirmationChallengeTtlMinutes: 10,
      confirmationChallengeResponseBytes: 32,
    });
  });
});
