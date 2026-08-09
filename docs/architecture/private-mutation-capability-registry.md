# Private mutation capability registry

The private API exposes a machine-readable registry for canonical state mutations. The registry is both descriptive and enforceable: it powers `GET /api/v1/private/capabilities` and the fail-closed middleware applied to unsafe methods under `/api/v1/private/*`.

## Contract

Each mutation declares:

- a stable operation name;
- the exact HTTP method and private API path;
- `externalEffect: false`;
- explicit retry semantics.

The current retry semantics are:

- `atomic-create`: the route performs an atomic audited create, but callers must not assume that resending an identical request is a semantic replay. On uncertainty, read canonical state before retrying.
- `deduplicated-state`: persistence prevents duplicate canonical state, but the request does not carry a full semantic replay ledger. Callers should reconcile final state after an ambiguous response.
- `optimistic-concurrency`: the mutation is guarded by observed state/CAS. A retry should use a fresh read unless the caller can prove the original request did not commit.
- `semantic-idempotency`: the request is associated with a stable retry key and the persisted ledger distinguishes an exact replay from reuse of the same key with a different intent. Exact retries are safe within that contract.

The global `semanticIdempotency: true` field in runtime capabilities means the private API supports semantic-idempotent operations. It does not mean every mutation is semantically idempotent. `stateWriteEndpoints[].retrySemantics` is authoritative per operation.

## Response headers

For a registered unsafe private mutation, middleware adds:

- `x-semogtw-operation`: stable operation name;
- `x-semogtw-retry-semantics`: one of the four retry contracts above.

These headers are assigned after same-origin, owner authentication and CSRF validation, but before route-specific body validation. A client can therefore classify an authenticated mutation response without maintaining a second operation table.

## Fail-closed allowlist

`GET`, `HEAD` and `OPTIONS` remain read/safe methods. Any other method under `/api/v1/private/*` must match an exact method/path pair in the registry. An unregistered unsafe request is rejected with `PRIVATE_MUTATION_NOT_REGISTERED`.

The ordering is intentional:

1. same-origin checks;
2. owner authentication;
3. CSRF validation;
4. mutation registry;
5. route implementation.

This prevents the registry from becoming an unauthenticated oracle for private write capabilities while also preventing a future `POST`, `PUT`, `PATCH`, `DELETE` or other unsafe handler from silently expanding the write surface.

## External-effect boundary

Every registered state write has `externalEffect: false`. The private API may record repository state, observations, evidence, runs, gates, reservations, redirects and audit events, but it does not claim that a repository checkout/fetch/push, local command, subprocess, ChatGPT/Codex session or other external execution happened.

External effects belong to an execution-capable toolchain. Their observed result can then be written back to the canonical state API with the appropriate evidence or orchestration operation.
