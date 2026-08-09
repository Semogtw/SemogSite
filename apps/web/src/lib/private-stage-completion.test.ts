import { describe, expect, it, vi } from "vitest";
import {
  completePrivateStage,
  type PrivateMutationClient,
} from "./private-stage-completion";

describe("completePrivateStage", () => {
  it("routes the typed intent through the canonical stage.complete operation", async () => {
    const mutate = vi.fn(async () => ({ stageId: "stage-1" }));
    const client = { mutate } as unknown as PrivateMutationClient;
    const input = {
      stageId: "stage-1",
      reason: "Gate validado.",
      confirmed: true as const,
    };

    await expect(completePrivateStage(client, input)).resolves.toEqual({
      stageId: "stage-1",
    });
    expect(mutate).toHaveBeenCalledWith("stage.complete", input);
  });
});
