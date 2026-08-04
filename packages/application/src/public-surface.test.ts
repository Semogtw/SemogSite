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
});
