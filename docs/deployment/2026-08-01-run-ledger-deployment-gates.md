# Cooperative run ledger deployment gates

## Current decision

The cooperative run ledger may be composed with the private Semogtw DevOS web application after dependency, migration, browser and rollback gates pass.

It may **not** be exposed to an external agent, ChatGPT client or remote MCP transport yet.

## Storage gates

Before deployment:

- apply migrations `0001`–`0005` to a disposable copy of the target database;
- verify all four ledger tables, indexes and foreign keys;
- verify additive migration preserves existing projects, sessions, evidence and GitHub observations;
- create and verify a file-backed backup after migration `0005`;
- restore the backup into a separate path and read run/event/checkpoint/command rows;
- prove the selected host provides durable writable storage for SQLite, or select a different storage adapter;
- document single-instance/multi-instance transaction behavior.

No ephemeral filesystem target is acceptable for the canonical private ledger without an external durable storage adapter.

## Owner web gates

Verify in the selected runtime:

- owner login/session/CSRF behavior;
- anonymous redirects for both run routes and mutation RPCs;
- private/no-store response behavior where applicable;
- registration, lifecycle, checkpoint and command writes;
- optimistic conflicts from two tabs;
- lost-response retry idempotency;
- terminal run form removal;
- malformed historical data rendering;
- 360 px layout, keyboard access and focus visibility;
- public confidentiality scan and anonymous HTTP smoke.

## Operational gates

Before enabling the feature for real project data:

- choose backup cadence and retention;
- define owner procedure for an inaccurately reported run;
- define reconciliation procedure after telemetry/storage outage;
- document how stale runs are reviewed without automatically cancelling them;
- document command expiry and rejection semantics;
- ensure logs omit command payloads, checkpoint text and private branch data by default;
- define database size monitoring and event-retention policy without deleting evidence silently;
- verify rollback to the previous application version while keeping migration `0005` data intact.

## Remote agent/MCP gates

Remote polling/writes stay disabled until a separate adapter proves:

### Identity and authorization

- short-lived, revocable agent credentials;
- explicit mapping from credential to owner/project/run scope;
- rejection of cross-run and cross-project access;
- credential rotation without redeploying source;
- no browser owner cookie reuse as agent authentication.

### Transport

- TLS and canonical endpoint;
- Host/Origin/DNS-rebinding policy;
- supported MCP/HTTP protocol version pinned by lockfile;
- request/response/timeout/concurrency limits;
- cancellation/disconnect behavior;
- no-store private caching;
- sanitized `WWW-Authenticate`/error responses.

### Replay and distributed consistency

- idempotency across retries and multiple instances;
- shared or storage-backed rate limiting;
- SQLite single-writer constraints understood, or storage adapter replaced;
- command polling does not acknowledge automatically;
- acknowledge/complete/reject requires optimistic command state;
- stale credentials and revoked sessions fail closed.

### Observability

- structured logs contain correlation IDs but not payloads/secrets;
- metrics count requests/status/conflicts without private labels;
- alerting for repeated authorization failures, conflict spikes and storage errors;
- endpoint disable switch and documented rollback.

### Client compatibility

- intended ChatGPT/MCP client can authenticate and discover only the approved scoped tools;
- no prompt transcript or hidden model state is expected or claimed;
- command polling cadence respects rate limits and expiry;
- client behavior after network loss/retry is verified.

## Release states

### Draft implementation

Current state:

- code and tests committed;
- owner UI and internal inbox implemented;
- remote transport absent;
- real dependency/migration/browser/build gates not yet observed.

### Ready for review

Requires:

- focused domain/database/web gates pass;
- full `pnpm check` and build pass;
- migration/backup gates pass;
- authenticated/anonymous browser gates pass;
- documentation reviewed against actual behavior;
- no high-severity security issue remains.

### Owner web deployment approved

Requires ready-for-review plus:

- selected host passes storage/secrets/auth/rollback gates;
- backup restore drill succeeds;
- deployment version is preserved before rollout.

### Remote agent deployment approved

Requires owner web approval plus every remote agent/MCP gate above and a separately reviewed transport implementation.

## Rollback

Application rollback must not drop migration `0005` tables or rewrite event history. A rollback procedure must:

1. preserve a verified database backup;
2. disable remote adapters first, when present;
3. deploy the last known application version compatible with the additive schema;
4. verify owner authentication and pre-ledger DevOS surfaces;
5. retain ledger tables for later reconciliation;
6. record the incident and exact migration/application versions.

Destructive down-migration is not part of normal rollback.
