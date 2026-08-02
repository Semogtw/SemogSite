import { describe, expect, it } from "vitest";
import { parseCommitList } from "./session-handoff-input";

describe("parseCommitList", () => {
  it("splits comma and whitespace separated SHAs and removes duplicates", () => {
    expect(
      parseCommitList(" ABCDEF1, 1234567890abcdef\nabcdef1   fedcba9 "),
    ).toEqual(["abcdef1", "1234567890abcdef", "fedcba9"]);
  });

  it("omits empty entries", () => {
    expect(parseCommitList("  , \n\t ")).toEqual([]);
  });
});
