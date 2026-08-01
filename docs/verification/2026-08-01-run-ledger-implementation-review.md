# Cooperative run ledger implementation review — 2026-08-01

## Scope reviewed

Branch: `develop/foundation-bootstrap`

Reviewed implementation areas:

- provider-neutral run state, registration, lifecycle, checkpoint, command and inbox services;
- SQLite migration `0005_cooperative_run_ledger.sql` and Drizzle schema composition;
- registration, lifecycle, checkpoint, command and inbox repositories;
- private read model and derived freshness/availability;
- owner-only `/devos/runs` routes and server functions;
- registration, lifecycle, checkpoint and command forms;
- agent participation, security, testing and deployment documentation.

## Implementation conclusions

### Run lifecycle

Implemented:

- running/blocked/terminal lifecycle;
- terminal immutability;
- monotonic progress;
- explicit heartbeat, block, resume, complete, fail and cancel;
- optimistic `expectedUpdatedAt` validation;
- append-only before/after events;
- deterministic read-time freshness.

### Checkpoints

Implemented:

- evidence-rich checkpoint service;
- commit SHA normalization/deduplication;
- explicit tests status and summary;
- blockers and next step;
- atomic run/event/checkpoint persistence;
- source hash for the owner web adapter;
- private checkpoint UI/history.

### Commands

Implemented:

- six allowlisted command kinds;
- sensitive-key and payload-size rejection;
- optional bounded expiration;
- stable-intent retry idempotency;
- command/event atomic persistence;
- acknowledge/complete/reject domain and SQLite transitions;
- immutable original command fields;
- provider-neutral FIFO non-expired inbox;
- separate persisted status and derived queue availability;
- owner command creation UI only — no browser-side agent acknowledgement.

### Owner web

Implemented:

- double owner guard (route plus server function);
- CSRF and literal confirmation for mutations;
- client UUID retained across retries;
- server-derived entity/event/correlation IDs;
- private/noindex route metadata;
- responsive list/detail forms and history;
- language that avoids live-model claims.

### Remote boundary

Not implemented:

- authenticated remote agent identity;
- HTTP/MCP command polling;
- remote heartbeat/checkpoint/transition tools;
- deployed endpoint or ChatGPT account integration.

The internal inbox is a composition primitive, not a public or authenticated transport.

## Review fixes applied

The implementation review found and corrected:

- missing `runs` export from the composed Drizzle schema;
- incomplete package barrel exports;
- registration retries conflicting solely because server timestamps changed;
- command retries conflicting solely because server timestamps changed;
- browser retries generating new command/event/correlation identities;
- generic lifecycle “checkpoint” not writing evidence-rich checkpoint rows;
- command transitions potentially accepting changes to immutable original fields;
- queued expired commands lacking a separate derived availability signal;
- raw English availability enum rendered in the private UI;
- responsive styles initially using noncanonical design-token names;
- command free-text limits not matching domain policy;
- migration/backup expectations stopping at migration `0004`.

## Verification actually observed

Previously observed in the connected environment for adjacent MCP work:

- Node.js 22 availability;
- TypeScript-assisted strict static checks for selected modules;
- Node-native transport/confidentiality guardrail fixtures;
- iterative sensitive-key scan with deep/circular object graphs.

For the cooperative run ledger specifically, this session observed:

- successful GitHub commits for each implementation/documentation unit;
- connector-visible branch/PR updates;
- direct code review of domain, repository, server, route and component contracts;
- consistent additive migration references through `0005` in committed test expectations;
- no remote MCP/HTTP listener introduced.

## Verification not observed

The following remain unexecuted for the current ledger HEAD:

- `pnpm install --frozen-lockfile` against a current local snapshot;
- real workspace TypeScript typecheck;
- Vitest domain/database/web suites;
- in-memory and file-backed migration `0001`–`0005` execution;
- backup/restore after migration `0005`;
- production build;
- authenticated browser workflows;
- anonymous redirect/confidentiality smoke;
- keyboard and 360×800 browser review;
- selected-host deployment/rollback.

Attempts to obtain a current repository snapshot through the connected shell/network did not produce a verifiable dependency-complete run. GitHub Actions were not added or used as a workaround.

## Required first gate sequence

```bash
corepack enable
pnpm install --frozen-lockfile
pnpm --filter @semogtw/domain typecheck
pnpm --filter @semogtw/domain test
pnpm --filter @semogtw/database typecheck
pnpm --filter @semogtw/database test
pnpm --filter @semogtw/web typecheck
pnpm check
pnpm build
```

Then execute migration/backup and browser gates from the dedicated test/deployment documents.

## Readiness assessment

Engineering estimate, not test passage:

- cooperative ledger feature implementation: approximately 98%;
- current foundation PR feature implementation: approximately 90%;
- current foundation PR merge/deployment readiness: approximately 72%, limited primarily by unobserved verification and host/runtime gates;
- broader long-term Semogtw roadmap: approximately 63%, because remote authenticated agent/MCP transport, editorial publication workflow, scheduled reconciliation/webhooks and production deployment remain future phases.

## Exact next action

Run the focused domain/database/web gates on the current branch. Fix the first observed TypeScript or test diagnostic, rerun until clean, then execute migration/backup and authenticated/anonymous browser gates. Keep PR #1 draft until those outputs are recorded.
