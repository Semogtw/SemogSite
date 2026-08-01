import { describe, expect, it } from "vitest";
import { readCookie } from "./cookies";

describe("readCookie", () => {
  it("reads the requested cookie and preserves equals signs", () => {
    expect(readCookie("semogtw_csrf", "other=1; semogtw_csrf=a.b=c; x=2")).toBe(
      "a.b=c",
    );
  });

  it("returns null when the cookie is absent or malformed", () => {
    expect(readCookie("semogtw_csrf", "other=1")).toBeNull();
    expect(readCookie("semogtw_csrf", "malformed")).toBeNull();
  });
});
