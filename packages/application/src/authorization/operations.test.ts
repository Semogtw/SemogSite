import { describe, expect, it } from "vitest";
import * as operations from "./operations";

describe("agent authorization operation plans", () => {
  it("exports only pure grant and trust planning functions", () => {
    expect(operations).toMatchObject({
      evaluateAgentGrantState: expect.any(Function),
      planAgentGrantCreation: expect.any(Function),
      planAgentGrantAvailabilityTransition: expect.any(Function),
      planAgentGrantExpiration: expect.any(Function),
      planAgentGrantRevision: expect.any(Function),
      planAgentGrantStatusTransition: expect.any(Function),
      planAgentGrantRevocation: expect.any(Function),
      planTrustSessionOperationConsumption: expect.any(Function),
      planAgentTrustSessionRevocation: expect.any(Function),
    });
  });
});
