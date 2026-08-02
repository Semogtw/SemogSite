import { describe, expect, it } from "vitest";
import { decideMutationAuthorization } from "./mutation-policy";

describe("decideMutationAuthorization", () => {
  it("allows only an authenticated owner with valid CSRF", () => {
    expect(
      decideMutationAuthorization({ ownerResolved: true, csrfValid: true }),
    ).toEqual({ allowed: true });
  });

  it("rejects anonymous and invalid-CSRF mutations generically", () => {
    expect(
      decideMutationAuthorization({ ownerResolved: false, csrfValid: false }),
    ).toEqual({ allowed: false, code: "MUTATION_NOT_AUTHORIZED" });
    expect(
      decideMutationAuthorization({ ownerResolved: true, csrfValid: false }),
    ).toEqual({ allowed: false, code: "MUTATION_NOT_AUTHORIZED" });
  });
});
