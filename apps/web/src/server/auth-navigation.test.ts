import { describe, expect, it } from "vitest";
import { safeReturnTo } from "./auth-navigation";

describe("safeReturnTo", () => {
  it("accepts only known protected destinations", () => {
    expect(safeReturnTo("/devos/today")).toBe("/devos/today");
    expect(safeReturnTo("/devos/projects")).toBe("/devos/projects");
    expect(safeReturnTo("/devos/insights")).toBe("/devos/insights");
    expect(safeReturnTo("/devos/capture")).toBe("/devos/capture");
    expect(safeReturnTo("/devos/search")).toBe("/devos/search");
    expect(safeReturnTo("/devos/content")).toBe("/devos/content");
    expect(safeReturnTo("/devos/more")).toBe("/devos/more");
  });

  it("rejects external, protocol-relative and unknown destinations", () => {
    expect(safeReturnTo("https://example.com")).toBe("/devos");
    expect(safeReturnTo("//example.com")).toBe("/devos");
    expect(safeReturnTo("/devos/projects/private-slug")).toBe("/devos");
    expect(safeReturnTo("/devos/unknown")).toBe("/devos");
    expect(safeReturnTo(undefined)).toBe("/devos");
  });
});
