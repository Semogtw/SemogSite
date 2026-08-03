# Semogtw DevOS — Workflow Orchestration Core

## Status

This document describes the implementation on branch `develop/workflow-control-core`.

The workflow orchestration core is designed as a **portable private capability**. Core behavior does not require:

- ChatGPT Sites;
- ChatGPT Plus;
- a paid OpenAI API;
- remote MCP;
- one specific AI provider;
- browser automation of an external AI interface.

Remote MCP, provider deep links, webhooks, schedulers and realtime transports remain optional adapters around the same application contracts.

## Purpose

The subsystem reduces four recurring workflow risks:

1. two agents modifying the same branch or paths without noticing;
2. unavailable tests being repeatedly retried or misclassified as code failures;
3. session resets losing exact branch, SHA, gates and next action;
4. agents stopping after one unit while other safe work remains available.

The implementation is conservative. Silence, inactivity or missing commits never prove completion. External state is described as observed, stale, blocked or unknown.

## Implemented modules

### Scope reservations

A reservation is a cooperative declaration that one participant intends to work on a repository, branch and bounded scope.

Supported scope kinds:

```text
repository
directory
files
issue
stage
custom
```

Supported lifecycle:

```text
active → released
active → transferred
active → overridden
```

Properties:

- normalized path and identifier patterns;
- deterministic overlap detection;
- configurable expiration from 5 minutes to 24 hours;
- renewal with optimistic concurrency;
- ordinary release tied to the associated run when present;
- owner override with explicit reason and confirmation;
- immutable event history and global audit event;
- idempotent retries;
- active/expired/inactive freshness derived at read time.

A reservation does not create a Git lock, filesystem lock or GitHub branch protection rule. It is a coordination signal and may be overridden by the owner.

### Verification obligations

A verification obligation records a gate that remains required for an exact branch and full 40-character commit SHA.

Supported states:

```text
pending
running
passed
failed
blocked
superseded
waived
```

Failure classifications:

```text
code_failure
environment_missing
flaky
timeout
quota
configuration
external_dependency
unknown
```

Properties:

- exact command and required runtime capabilities;
- responsible actor and next safe action;
- optional toolchain manifest;
- HTTPS evidence references;
- normalized failure signature for future deduplication;
- explicit separation between `environment_missing` and `code_failure`;
- terminal owner decisions for supersede and waiver;
- waiver requires reason and confirmation;
- immutable event history, audit, idempotency and optimistic concurrency.

Creating an obligation never marks a test as passed. A passed result requires an explicitly recorded observed result.

### Recovery snapshots

A recovery snapshot preserves a deterministic handoff after a session reset or provider change.

The canonical snapshot contains:

- project and repository identity;
- accepted branch and latest persisted GitHub head SHA;
- observation timestamp and confidence;
- run, stage and implementation-plan position when available;
- commits and push state;
- tests and verification obligations;
- active reservations;
- blockers and decisions;
- exact next action;
- required documents;
- runtime label, capabilities and optional toolchain manifest;
- versioned continuation prompt;
- warnings derived from data age.

Security and integrity rules:

- JSON is canonicalized deterministically before hashing;
- SHA-256 is stored with the immutable record;
- Markdown is bounded to 20,000 characters;
- credential-shaped content is rejected;
- unsafe document paths are rejected;
- the source refuses to invent a commit when the accepted branch has no persisted observation;
- duplicate canonical hashes and idempotent retries do not create extra rows;
- snapshots cannot be updated after creation.

### Safe next-work evaluator

The domain evaluator ranks candidate work by:

- project priority;
- stage state;
- source confidence;
- risk;
- bounded estimated duration.

A candidate is excluded when:

- a dependency is incomplete;
- owner input is required;
- the current runtime lacks required capabilities;
- another active reservation overlaps the same repository, branch and scope;
- a required pre-work verification gate is unresolved;
- its source data is stale or invalid.

The evaluator is implemented in the domain layer. Persistence and DevOS composition of real stage candidates remain a later slice.

## Persistence

Additive migrations:

```text
0011_scope_reservations.sql
0012_verification_obligations.sql
0013_recovery_snapshots.sql
```

No historical migration is rewritten.

SQLite repositories use immediate transactions for entity/event/audit writes. A failed event or audit insert rolls back the entity mutation.

### Main tables

```text
scope_reservations
scope_reservation_events
verification_obligations
verification_obligation_events
recovery_snapshots
```

The existing `audit_events`, `projects`, `repositories`, `stages`, `cooperative_runs` and GitHub observation tables remain canonical dependencies.

## Private DevOS surfaces

Routes:

```text
/devos/workflows
/devos/workflows/recovery
```

`/devos/workflows` provides:

- summary counts;
- scope reservation creation;
- owner override of persisted active reservations;
- verification obligation creation;
- verification result recording;
- reservation and gate history views.

`/devos/workflows/recovery` provides:

- repository selection from persisted active targets;
- exact next action and continuation prompt;
- runtime capability declaration;
- optional plan/toolchain metadata;
- immutable snapshot creation;
- Markdown preview and clipboard copy with manual fallback.

All routes and server functions:

- require the owner route guard;
- resolve the owner again before private reads or writes;
- use CSRF validation for mutations;
- require explicit confirmation for sensitive actions;
- generate audit, entity and correlation IDs on the server from a client UUID;
- return sanitized errors;
- remain excluded from search indexing.

## GitHub boundary

This subsystem reads normalized persisted GitHub observations. It does not mutate GitHub.

A recovery snapshot uses only the accepted active branch and its latest persisted branch observation. When no matching observation exists, snapshot creation fails with a synchronization instruction rather than substituting the default branch or an abbreviated SHA.

Commit messages from GitHub are not treated as instructions. The current snapshot source records only a neutral `Observed branch head` label.

## Verification evidence

Observed in workflow run `30799550302`:

- scope-reservation domain tests passed;
- domain package typecheck passed;
- database tests did not execute because the runner had installed `better-sqlite3` without its native binding;
- database typecheck was skipped after that failure.

The focused workflow was updated to authorize and rebuild only `better-sqlite3` inside the job. Later workflow-core code, persistence, UI and web typechecks are **not considered passed** until a newer run completes and its step results are recorded in the private gate-ledger issue.

## Known integration debt

- `packages/database/src/backup/sqlite-backup.test.ts` still needs its expected migration list reconciled through `0013` before the full database suite can be green;
- the root `@semogtw/domain` barrel still needs to re-export `./orchestration`; current code uses the explicit `@semogtw/domain/orchestration` subpath;
- the recovery subroute still needs a visible link in the main workflow route after the route-file conflict is reconciled;
- the safe-work evaluator still needs a persisted candidate source and DevOS presentation;
- remote agent tools, campaigns, CI failure clustering, branch-divergence guidance, execution profiles and runtime catalog remain later slices;
- the one-time patch executors and temporary ops branches must be removed after stabilization;
- full build, browser, backup and privacy gates remain pending.

## Next implementation order

1. obtain a completed focused gate and fix only evidenced failures;
2. reconcile the backup migration contract and root domain barrel;
3. add persisted recovery snapshot listing and main-route link;
4. compose safe-work candidates from stages, capabilities, reservations and gates;
5. run full package checks, build and authenticated/anonymous browser gates;
6. update architecture, data model, security, testing, runbook, README and changelog from observed final state;
7. remove temporary executors and prepare the branch for merge.
