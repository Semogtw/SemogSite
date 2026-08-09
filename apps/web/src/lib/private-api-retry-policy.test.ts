import { describe, expect, it } from "vitest";
import { getPrivateMutationRetryPolicy } from "./private-api-retry-policy";

describe("private mutation retry policy", () => {
  it("allows exact automatic transport retry only for semantic idempotency", () => {
    expect(
      getPrivateMutationRetryPolicy({ retrySemantics: "semantic-idempotency" }),
    ).toEqual({
      action: "retry-exact-intent",
      automaticTransportRetry: true,
      requiresFreshRead: false,
      preservesRetryKey: true,
    });
  });

  it("requires a canonical refresh for optimistic concurrency", () => {
    expect(
      getPrivateMutationRetryPolicy({ retrySemantics: "optimistic-concurrency" }),
    ).toEqual({
      action: "refresh-canonical-state",
      automaticTransportRetry: false,
      requiresFreshRead: true,
      preservesRetryKey: false,
    });
  });

  it("reconciles deduplicated state instead of blindly recreating it", () => {
    expect(
      getPrivateMutationRetryPolicy({ retrySemantics: "deduplicated-state" }),
    ).toMatchObject({
      action: "reconcile-canonical-state",
      automaticTransportRetry: false,
      requiresFreshRead: true,
    });
  });

  it("verifies atomic creates before a retry", () => {
    expect(
      getPrivateMutationRetryPolicy({ retrySemantics: "atomic-create" }),
    ).toMatchObject({
      action: "verify-before-retry",
      automaticTransportRetry: false,
      requiresFreshRead: true,
    });
  });
});
