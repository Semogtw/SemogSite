export type PrivateRetrySemantics =
  | "atomic-create"
  | "deduplicated-state"
  | "optimistic-concurrency"
  | "semantic-idempotency";

export type PrivateStateWriteCapability = {
  name: string;
  method: "POST";
  path: `/api/v1/private/${string}`;
  externalEffect: false;
  retrySemantics: PrivateRetrySemantics;
};

/**
 * Canonical registry of state-changing operations exposed by the private API.
 *
 * `externalEffect: false` is intentional: these endpoints mutate audited
 * canonical state only. Repository/CLI/process effects belong to an execution
 * toolchain and must be recorded back through observed-state/evidence flows.
 *
 * Retry semantics are declared per operation. Only ledgers with a stable
 * semantic idempotency key advertise exact-intent replay safety; CAS and
 * append-only creates deliberately require more conservative client behavior.
 */
export const privateStateWriteCapabilities = [
  {
    name: "attention.capture",
    method: "POST",
    path: "/api/v1/private/attention",
    externalEffect: false,
    retrySemantics: "atomic-create",
  },
  {
    name: "attention.transition",
    method: "POST",
    path: "/api/v1/private/attention/transition",
    externalEffect: false,
    retrySemantics: "optimistic-concurrency",
  },
  {
    name: "evidence.record",
    method: "POST",
    path: "/api/v1/private/evidence",
    externalEffect: false,
    retrySemantics: "atomic-create",
  },
  {
    name: "session_handoff.create",
    method: "POST",
    path: "/api/v1/private/session-handoffs",
    externalEffect: false,
    retrySemantics: "atomic-create",
  },
  {
    name: "stage.complete",
    method: "POST",
    path: "/api/v1/private/stages/complete",
    externalEffect: false,
    retrySemantics: "optimistic-concurrency",
  },
  {
    name: "repository.sync_target.register",
    method: "POST",
    path: "/api/v1/private/repository-targets/register",
    externalEffect: false,
    retrySemantics: "deduplicated-state",
  },
  {
    name: "repository.sync_target.change",
    method: "POST",
    path: "/api/v1/private/repository-targets/lifecycle",
    externalEffect: false,
    retrySemantics: "optimistic-concurrency",
  },
  {
    name: "repository.active_branch.accept",
    method: "POST",
    path: "/api/v1/private/branch-recommendations/accept",
    externalEffect: false,
    retrySemantics: "optimistic-concurrency",
  },
  {
    name: "cooperative_run.register",
    method: "POST",
    path: "/api/v1/private/cooperative-runs/register",
    externalEffect: false,
    retrySemantics: "semantic-idempotency",
  },
  {
    name: "cooperative_run.transition",
    method: "POST",
    path: "/api/v1/private/cooperative-runs/transition",
    externalEffect: false,
    retrySemantics: "semantic-idempotency",
  },
  {
    name: "verification_obligation.create",
    method: "POST",
    path: "/api/v1/private/verification-obligations/create",
    externalEffect: false,
    retrySemantics: "semantic-idempotency",
  },
  {
    name: "verification_obligation.result",
    method: "POST",
    path: "/api/v1/private/verification-obligations/result",
    externalEffect: false,
    retrySemantics: "semantic-idempotency",
  },
  {
    name: "verification_obligation.supersede",
    method: "POST",
    path: "/api/v1/private/verification-obligations/supersede",
    externalEffect: false,
    retrySemantics: "semantic-idempotency",
  },
  {
    name: "verification_obligation.waive",
    method: "POST",
    path: "/api/v1/private/verification-obligations/waive",
    externalEffect: false,
    retrySemantics: "semantic-idempotency",
  },
  {
    name: "scope_reservation.acquire",
    method: "POST",
    path: "/api/v1/private/scope-reservations/acquire",
    externalEffect: false,
    retrySemantics: "semantic-idempotency",
  },
  {
    name: "scope_reservation.renew",
    method: "POST",
    path: "/api/v1/private/scope-reservations/renew",
    externalEffect: false,
    retrySemantics: "semantic-idempotency",
  },
  {
    name: "scope_reservation.release",
    method: "POST",
    path: "/api/v1/private/scope-reservations/release",
    externalEffect: false,
    retrySemantics: "semantic-idempotency",
  },
  {
    name: "scope_reservation.override",
    method: "POST",
    path: "/api/v1/private/scope-reservations/override",
    externalEffect: false,
    retrySemantics: "semantic-idempotency",
  },
  {
    name: "editorial_redirect.create",
    method: "POST",
    path: "/api/v1/private/editorial-redirects/create",
    externalEffect: false,
    retrySemantics: "semantic-idempotency",
  },
  {
    name: "editorial_redirect.revoke",
    method: "POST",
    path: "/api/v1/private/editorial-redirects/revoke",
    externalEffect: false,
    retrySemantics: "semantic-idempotency",
  },
] as const satisfies readonly PrivateStateWriteCapability[];
