# Private mutation retry playbook

Private mutation callers should use `x-semogtw-retry-semantics` or `GET /api/v1/private/capabilities` instead of applying one retry policy to every write.

## `semantic-idempotency`

The request carries a stable retry identity that is persisted in the operation ledger. An exact replay can be classified as the same intent; reuse of the same key with a different semantic intent is a conflict.

Recommended client behavior:

1. generate the retry key once for the user/agent intent;
2. keep the same key across transport retries of that intent;
3. if the response is ambiguous because the connection failed, retry the exact request with the same key;
4. do not recycle the key for edited payloads;
5. treat a conflict on reused key as evidence that the new request is not the original intent.

Current examples include cooperative-run transitions, verification obligations, scope reservations and editorial redirects.

## `optimistic-concurrency`

The mutation is guarded by previously observed state. The request may succeed once, but blindly resending it after an ambiguous transport failure can race with newer state.

Recommended client behavior:

1. keep the observed version/timestamp/state used to make the decision;
2. send one mutation against that observation;
3. after an ambiguous response, read canonical state before deciding whether to retry;
4. if the observed state changed, rebuild the decision from the fresh snapshot;
5. never replace a CAS conflict with a force-write unless a separate confirmed override contract exists.

Current examples include stage completion, attention lifecycle, repository-target lifecycle and branch-recommendation acceptance.

## `deduplicated-state`

Persistence protects the canonical resource from a duplicate state representation, but the route does not provide a full request-intent replay ledger.

Recommended client behavior:

1. on a clear success, continue normally;
2. on an ambiguous response, read the canonical resource;
3. if the desired state already exists, treat reconciliation as success at the workflow layer;
4. if a conflicting resource exists, surface that state rather than synthesizing a duplicate create.

Repository sync-target registration is the current example.

## `atomic-create`

The write and its audit data are committed atomically, but the route does not promise that an identical transport retry maps to the same semantic operation.

Recommended client behavior:

1. avoid automatic blind retry after an ambiguous connection failure;
2. query the relevant canonical state/audit surface first;
3. create a new intent only when the caller can determine the previous attempt did not commit or when a second record is genuinely intended.

Attention capture, evidence recording and session handoff creation are current examples.

## External effects

Retry semantics in this registry describe canonical state writes only. They do not make GitHub checkout/fetch/push, command execution or process control idempotent, because those effects are intentionally outside this API. Execution-capable toolchains must define their own retry/observation contract and then record the resulting state/evidence separately.
