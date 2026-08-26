import { describe, expect, it } from "vitest";
import {
  normalizeConfiguredPublicOrigin,
  publicUrl,
} from "./-public-url";

describe("public URL helpers", () => {
  it("normalizes a production HTTPS origin", () => {
    expect(normalizeConfiguredPublicOrigin("https://portfolio.example.com/")).toBe(
      "https://portfolio.example.com",
    );
    expect(publicUrl("/projects", "https://portfolio.example.com")).toBe(
      "https://portfolio.example.com/projects",
    );
  });

  it("keeps relative URLs when no public origin is configured", () => {
    expect(normalizeConfiguredPublicOrigin(undefined)).toBeNull();
    expect(publicUrl("/projects", null)).toBe("/projects");
  });

  it("allows loopback HTTP only for local development", () => {
    expect(normalizeConfiguredPublicOrigin("http://127.0.0.1:4173")).toBe(
      "http://127.0.0.1:4173",
    );
    expect(normalizeConfiguredPublicOrigin("http://localhost:3000/")).toBe(
      "http://localhost:3000",
    );
  });

  it.each([
    "http://portfolio.example.com",
    "https://user:secret@portfolio.example.com",
    "https://portfolio.example.com/path",
    "https://portfolio.example.com/?preview=1",
    "https://portfolio.example.com/#fragment",
    "not a url",
  ])("rejects unsafe or non-origin configuration: %s", (value) => {
    expect(() => normalizeConfiguredPublicOrigin(value)).toThrow(
      "PUBLIC_ORIGIN_INVALID",
    );
  });

  it.each(["projects", "//evil.example/path"])(
    "rejects invalid public paths: %s",
    (path) => {
      expect(() => publicUrl(path, "https://portfolio.example.com")).toThrow(
        "PUBLIC_PATH_INVALID",
      );
    },
  );
});
