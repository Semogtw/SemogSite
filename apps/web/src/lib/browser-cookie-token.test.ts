import { describe, expect, it } from "vitest";
import {
  createBrowserCookieTokenProvider,
  readBrowserCookie,
} from "./browser-cookie-token";

describe("browser cookie token helper", () => {
  it("reads an exact cookie name without prefix collisions", () => {
    const source = "session=abc; csrf_old=wrong; csrf=right%20token; theme=dark";
    expect(readBrowserCookie("csrf", source)).toBe("right token");
    expect(readBrowserCookie("csr", source)).toBeNull();
  });

  it("preserves malformed percent encoding rather than throwing", () => {
    expect(readBrowserCookie("csrf", "csrf=%E0%A4%A")).toBe("%E0%A4%A");
  });

  it("returns null for an empty or missing cookie name", () => {
    expect(readBrowserCookie("", "csrf=token")).toBeNull();
    expect(readBrowserCookie("missing", "csrf=token")).toBeNull();
  });

  it("creates a lazy token provider from the caller-owned cookie name", () => {
    let source = "csrf=first";
    const provider = createBrowserCookieTokenProvider("csrf", () => source);

    expect(provider()).toBe("first");
    source = "csrf=second";
    expect(provider()).toBe("second");
    source = "session=only";
    expect(provider()).toBe("");
  });
});
