import { describe, expect, it } from "vitest";
import { decideLogout } from "./logout-policy";

describe("logout policy", () => {
  it("revokes only a resolved session with matching CSRF proof", () => {
    expect(
      decideLogout({
        hasRawToken: true,
        hasCsrfCookie: true,
        ownerResolved: true,
        csrfValid: true,
      }),
    ).toEqual({ allowed: true, revoke: true, clearCookies: true });
  });

  it("rejects a live session without complete CSRF proof", () => {
    expect(
      decideLogout({
        hasRawToken: true,
        hasCsrfCookie: true,
        ownerResolved: true,
        csrfValid: false,
      }),
    ).toEqual({ allowed: false, revoke: false, clearCookies: false });
  });

  it("allows stale client cookies to be cleared idempotently", () => {
    expect(
      decideLogout({
        hasRawToken: true,
        hasCsrfCookie: false,
        ownerResolved: false,
        csrfValid: false,
      }),
    ).toEqual({ allowed: true, revoke: false, clearCookies: true });
  });
});
