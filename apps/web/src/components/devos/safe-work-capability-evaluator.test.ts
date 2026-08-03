import { describe, expect, it } from "vitest";
import { splitCapabilities } from "./safe-work-capability-evaluator";

describe("splitCapabilities", () => {
  it("normalizes, deduplicates and sorts explicit runtime capabilities", () => {
    expect(
      splitCapabilities(" Node-22, pnpm-10\nnode-22, GITHUB-WRITE "),
    ).toEqual(["github-write", "node-22", "pnpm-10"]);
  });

  it("keeps the conservative empty-capability default", () => {
    expect(splitCapabilities("  ,\n ")).toEqual([]);
  });
});
