# Web migration to the private canonical API

The private Worker/D1 routes are now a real application surface, not only a deployment adapter. Web code should migrate from Node-bound server actions to the capability-aware private API incrementally, while preserving the same domain services and security envelope.

## Browser client

`apps/web/src/lib/private-api-client.ts` provides the low-level browser transport:

- `GET /api/v1/private/capabilities` discovery;
- same-origin credentials;
- CSRF header injection per mutation;
- operation-name to endpoint resolution;
- response-envelope parsing;
- `x-semogtw-operation` validation;
- `x-semogtw-retry-semantics` validation;
- a cached capability registry with explicit invalidation and one refresh when a requested operation is newly deployed.

The client intentionally accepts a `getCsrfToken` provider. It must be connected to the application's existing CSRF bootstrap rather than hardcoding a cookie name or importing a Node-heavy authentication implementation into browser code.

## DevOS facade

`apps/web/src/lib/private-devos-client.ts` composes the browser transport into one frontend-facing object.

Typed wrappers currently exist for:

- stage completion;
- attention lifecycle;
- repository-target registration;
- repository-target lifecycle;
- branch recommendation acceptance;
- cooperative-run registration;
- editorial redirect create/revoke.

The facade also exposes a generic registered `mutate(operation, payload)` path so already-deployed operations such as Verification Obligations and Scope Reservations can use the capability registry before their final UI-specific types/wrappers are migrated.

## Retry behavior

Web code must not treat every mutation as idempotent. Use `getRetryPolicy(operation)` or the capability's `retrySemantics`:

- `semantic-idempotency`: exact transport retry of the same intent/key is allowed;
- `optimistic-concurrency`: refresh canonical state before retrying;
- `deduplicated-state`: reconcile canonical state before deciding whether another create is required;
- `atomic-create`: verify whether the first create committed before retrying.

Explicit API/domain errors are not transport ambiguity. Validation/auth/CAS errors should be handled as their own states rather than fed into automatic retry.

## Component migration sequence

For each Node-bound mutation in the web app:

1. identify the existing domain intent and its private operation name;
2. ensure the capability registry advertises the exact method/path/retry contract;
3. add or reuse a typed browser wrapper;
4. inject the existing CSRF-token provider into one shared `PrivateDevosClient` instance;
5. replace the component/server-action call with the typed client method;
6. preserve current confirmation UX and optimistic-state expectations;
7. use canonical API errors/correlation IDs in failure handling;
8. remove the obsolete Node mutation path only after its UI callers are gone and tests cover the new browser route.

Reads can migrate separately. A mutation should not be switched merely because a Worker route exists; its caller must also retain the observed version/timestamp data required by the domain CAS contract.

## External actions

The browser client is for canonical state only. It must not grow methods that pretend to execute repository checkout/fetch/push, CLI commands, subprocesses or ChatGPT/Codex process control. Those effects belong to an execution-capable toolchain and can report their observed results back through the canonical API.
