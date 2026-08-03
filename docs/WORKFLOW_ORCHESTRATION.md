# Semogtw DevOS — Workflow Orchestration Core

## Status

This document describes the implemented and verified private workflow core on branch `develop/workflow-control-core`.

The core is portable and does not require ChatGPT Sites, ChatGPT Plus, a paid OpenAI API, remote MCP, one AI provider, browser automation, webhooks or a background scheduler. Those may be added later as adapters around the same contracts.

Silence, inactivity or absence of commits never proves completion. External state is described as observed, stale, blocked or unknown.

## Purpose

The subsystem reduces four recurring risks:

1. concurrent sessions modifying the same branch or paths unknowingly;
2. unavailable tests being retried or mislabeled as code regressions;
3. resets losing branch, SHA, gates and exact next action;
4. work stopping while another bounded safe unit remains available.

## Modules

### Scope reservations

A reservation is a cooperative soft lease over repository, branch and normalized scope. Supported kinds are `repository`, `directory`, `files`, `issue`, `stage` and `custom`.

Lifecycle:

```text
active → released
active → transferred
active → overridden
```

Properties:

- deterministic normalized overlap detection;
- expiration from 5 minutes to 24 hours;
- freshness derived at read time, without scheduler dependency;
- optimistic renewal/release;
- owner override with reason and confirmation;
- idempotent mutations;
- immutable entity events and global audit;
- context identity bound to the target before repository access.

A reservation is not a Git lock, filesystem lock or branch-protection rule.

### Verification obligations

An obligation records a gate required for an exact branch and full 40-character SHA.

States:

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

The record preserves the exact command, required capabilities, responsible actor, next action, optional toolchain manifest and HTTPS evidence. Failed/blocked outcomes require explicit observed classification. Creating a gate never marks it passed.

### Recovery snapshots

A snapshot preserves a deterministic handoff after reset or provider change. Canonical content includes:

- project/repository and accepted branch;
- latest matching persisted GitHub head SHA;
- observation timestamp/confidence;
- run/stage/plan position when available;
- commits, push state, gates and active reservations;
- blockers, decisions and exact next action;
- required documents and runtime/toolchain context;
- versioned continuation prompt.

Integrity controls:

- deterministic canonical JSON;
- SHA-256 stored with an immutable row;
- Markdown limited to 20,000 characters;
- credential-shaped text and unsafe paths rejected;
- no fabricated/default/abbreviated SHA fallback;
- canonical-hash and idempotency deduplication;
- 20 most recent records shown privately, newest first;
- clipboard copy with manual-selection fallback.

### Safe next-work evaluator

The evaluator ranks bounded candidates by project priority, stage state, source confidence, risk and estimated duration.

The persisted source is conservative:

- demonstration seed data is ignored;
- only the first unfinished stage is eligible;
- later stages become `PREVIOUS_STAGE_INCOMPLETE` exclusions;
- zero active repositories becomes `REPOSITORY_NOT_FOUND`;
- multiple active repositories becomes `REPOSITORY_AMBIGUOUS`;
- project/stage locks require owner action;
- unresolved gates contribute blockers/capabilities;
- active reservations contribute scope conflicts;
- stale/invalid source data is not ranked.

The initial DevOS read supplies no runtime capabilities. Owner-entered capabilities are normalized and used only for the current response; they are not persisted or treated as execution evidence.

## Persistence

Additive migrations:

```text
0011_scope_reservations.sql
0012_verification_obligations.sql
0013_recovery_snapshots.sql
```

Main tables:

```text
scope_reservations
scope_reservation_events
verification_obligations
verification_obligation_events
recovery_snapshots
```

Existing projects, repositories, stages, cooperative runs, GitHub observations and `audit_events` remain canonical dependencies. Entity/event/audit writes share immediate SQLite transactions; event or audit failure rolls back the mutation.

## Private surfaces

```text
/devos/workflows
/devos/workflows/recovery
```

The dashboard provides summary counts, safe-work recommendations/exclusions, reservation/gate creation, owner override, observed-result recording and recovery navigation.

The recovery workspace provides target selection, exact continuation context, optional plan/toolchain fields, immutable snapshot creation, preview/copy and recent history.

The recovery file route is `devos.workflows_.recovery.tsx`, a sibling route preserving `/devos/workflows/recovery` without requiring an `<Outlet>` in the dashboard.

Every route/server function:

- requires owner authorization;
- resolves the owner again for private data;
- validates CSRF on mutations;
- requires confirmation for sensitive operations;
- generates actor/audit/correlation identities server-side;
- returns sanitized errors;
- uses noindex metadata.

## GitHub boundary

The subsystem reads normalized persisted GitHub observations and never writes GitHub. Snapshot generation uses only the accepted active branch and latest matching branch observation. Missing evidence returns a synchronization instruction and leaves snapshot history unchanged.

Commit messages are not interpreted as instructions; recovery renders a neutral observed-head description.

## Verification evidence

Workflow run `30841132598` completed successfully on August 3, 2026 for commit `94956d10f805e13af7f11e5e2e4f63e8e4abe4b8` and verified:

- frozen install and reviewed CI-only native `better-sqlite3` build;
- package and public-confidentiality scanners;
- 34 focused orchestration domain tests;
- 33 focused migration/database/backup tests;
- 8 focused web/control tests;
- all workspace typechecks;
- `pnpm check`: 151 files and 576 tests;
- production client/SSR build;
- 13 migrations server-side and none client-side;
- six Playwright scenarios:
  - anonymous redirects before private content;
  - no workflow markers on the public homepage;
  - authenticated dashboard/recovery navigation;
  - explicit session capability evaluation;
  - 360 × 800 no-overflow behavior;
  - private target registration, reservation creation/override, exact-SHA gate creation, `blocked/environment_missing` result and recovery fail-closed without GitHub observation.

The ephemeral native-build allowlist exists only in the discarded runner checkout. Documentation commits after this run require one final complete workflow execution before merge.

## Remaining work

- final full gate on the documentation-reconciled head;
- update PR #14 with final evidence and review readiness;
- merge or otherwise integrate draft cleanup PR #18 so one-shot patch executors do not survive;
- rehearse rollback/backup on the selected deployment host;
- validate live GitHub token permissions/provider behavior in that runtime;
- design future inactivity/continuation functionality separately;
- keep remote agents, MCP writes, campaigns, CI clustering and branch-divergence guidance out of this core until separately specified.