import { describe, expect, it } from "vitest";
import { decideLogout } from "./logout-policy";

describe("decideLogout", () => {
  it("revokes and clears a valid active session", () => {
    expect(
      decideLogout({
        hasRawToken: true,
        hasCsrfCookie: true,
        ownerResolved: true,
        csrfValid: true,
      }),
    ).toEqual({ allowed: true, revoke: true, clearCookies: true });
  });

  it("rejects a request with an active session and invalid CSRF", () => {
    expect(
      decideLogout({
        hasRawToken: true,
        hasCsrfCookie: true,
        ownerResolved: true,
        csrfValid: false,
      }),
    ).toEqual({ allowed: false, revoke: false, clearCookies: false });
  });

  it("clears stale local cookies when no active session resolves", () => {
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
