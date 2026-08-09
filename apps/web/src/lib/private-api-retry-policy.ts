import type {
  PrivateRetrySemantics,
  PrivateStateWriteCapability,
} from "./private-api-client";

export type PrivateMutationRetryAction =
  | "retry-exact-intent"
  | "refresh-canonical-state"
  | "reconcile-canonical-state"
  | "verify-before-retry";

export type PrivateMutationRetryPolicy = {
  action: PrivateMutationRetryAction;
  automaticTransportRetry: boolean;
  requiresFreshRead: boolean;
  preservesRetryKey: boolean;
};

const policies: Record<PrivateRetrySemantics, PrivateMutationRetryPolicy> = {
  "semantic-idempotency": {
    action: "retry-exact-intent",
    automaticTransportRetry: true,
    requiresFreshRead: false,
    preservesRetryKey: true,
  },
  "optimistic-concurrency": {
    action: "refresh-canonical-state",
    automaticTransportRetry: false,
    requiresFreshRead: true,
    preservesRetryKey: false,
  },
  "deduplicated-state": {
    action: "reconcile-canonical-state",
    automaticTransportRetry: false,
    requiresFreshRead: true,
    preservesRetryKey: false,
  },
  "atomic-create": {
    action: "verify-before-retry",
    automaticTransportRetry: false,
    requiresFreshRead: true,
    preservesRetryKey: false,
  },
};

/**
 * Converts the API's persistence contract into a conservative client retry
 * policy for ambiguous transport outcomes. Domain/API errors still win: this
 * helper must not be used to retry explicit validation, auth or CAS failures.
 */
export function getPrivateMutationRetryPolicy(
  capability: Pick<PrivateStateWriteCapability, "retrySemantics">,
): PrivateMutationRetryPolicy {
  return policies[capability.retrySemantics];
}
