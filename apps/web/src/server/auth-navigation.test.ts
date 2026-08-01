import { describe, expect, it } from "vitest";
import { safeReturnTo } from "./auth-navigation";

describe("safeReturnTo", () => {
  it("accepts only known protected destinations", () => {
    expect(safeReturnTo("/devos/today")).toBe("/devos/today");
    expect(safeReturnTo("/devos/projects")).toBe("/devos/projects");
  });

  it("rejects external, protocol-relative and unknown destinations", () => {
    expect(safeReturnTo("https://example.com")).toBe("/devos");
    expect(safeReturnTo("//example.com")).toBe("/devos");
    expect(safeReturnTo("/devos/projects/private-slug")).toBe("/devos");
    expect(safeReturnTo(undefined)).toBe("/devos");
  });
});
