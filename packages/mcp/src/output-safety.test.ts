import { describe, expect, it } from "vitest";
import { containsSensitiveOutputKey } from "./output-safety";

describe("containsSensitiveOutputKey", () => {
  it.each([
    "password",
    "rawPassword",
    "passwordHash",
    "password_digest",
    "accessToken",
    "csrf_token",
    "clientSecret",
    "api_key",
    "privateKey",
    "authorization",
    "cookie",
    "setCookie",
    "credentials",
    "secrets",
    "sessionDigest",
    "tokenDigest",
    "cookieDigest",
  ])("rejects sensitive key %s", (key) => {
    expect(containsSensitiveOutputKey({ nested: { [key]: "marker" } })).toBe(
      true,
    );
  });

  it.each([
    "tokenConfigured",
    "secretConfigured",
    "passwordRotationRequired",
    "authorizationStatus",
    "cookiePolicy",
    "contentDigest",
  ])("allows non-secret metadata key %s", (key) => {
    expect(containsSensitiveOutputKey({ [key]: true })).toBe(false);
  });

  it("handles repeated and circular references without recursion failure", () => {
    const shared = { safe: true };
    const value: Record<string, unknown> = {
      first: shared,
      second: shared,
    };
    value.self = value;

    expect(containsSensitiveOutputKey(value)).toBe(false);
    shared.safe = false;
    Object.assign(shared, { accessToken: "marker" });
    expect(containsSensitiveOutputKey(value)).toBe(true);
  });
});
