import { describe, expect, it } from "vitest";
import * as authorization from "./index";

describe("agent authorization barrel", () => {
  it("exports the provider-neutral authorization foundation", () => {
    expect(authorization).toMatchObject({
      agentCapabilities: expect.any(Array),
      validateAgentAuthorizationCatalog: expect.any(Function),
      validateResourceSelectorForKind: expect.any(Function),
      computeEffectiveAgentAuthorization: expect.any(Function),
      validateAgentGrantRequest: expect.any(Function),
      planAgentGrantRevocation: expect.any(Function),
      planAgentClientRevocation: expect.any(Function),
      planAgentTrustSessionCreation: expect.any(Function),
      planAgentTrustSessionRevocation: expect.any(Function),
      createAgentAuthorizationMutationExecutor: expect.any(Function),
      validateTrustSessionRequest: expect.any(Function),
      trustSessionCoversCommand: expect.any(Function),
      writesAllowed: expect.any(Function),
      createConfirmationChallengeService: expect.any(Function),
      decideAgentCommandDisposition: expect.any(Function),
      createAgentCommandPolicy: expect.any(Function),
    });
  });
});
