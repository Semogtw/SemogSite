# Learning Growth Core — implementation evidence

## Scope

This record covers the current `develop/learning-growth-core-implementation` branch stacked on PR #23. It distinguishes implemented code from actually executed verification.

## Implemented slices

- provider-neutral goal, checkpoint and skill contracts;
- strict normalization and validation;
- progress derived only from checkpoint state and weights;
- indeterminate progress when no measurable checkpoint exists;
- goal, checkpoint and skill lifecycle services;
- deterministic integer checkpoint weights totaling 100;
- five versioned deterministic goal templates;
- truthful private assistance provenance;
- manual/template quick-create preparation and atomic service envelope;
- migration `0015_learning_goals.sql`;
- transactional SQLite repositories for goals, checkpoints, skills and quick creation;
- owner-scoped private Growth read model;
- backup/restore coverage additions;
- explicit `@semogtw/domain/growth` and `@semogtw/database/growth` package surfaces.

## Verification actually executed in the implementation session

### Supplemental SQLite validation

The migration SQL was applied with Python's standard `sqlite3` library in an in-memory database after applying the preceding committed migrations. The supplemental check observed:

- all eight Growth tables created;
- foreign keys enabled;
- contiguous event-sequence trigger rejecting a skipped sequence;
- immutable-event trigger rejecting update/delete;
- no canonical goal-percentage column.

Classification: `supplemental_environment`. This is useful SQL evidence but does not replace the repository's `better-sqlite3`, Drizzle and Vitest gates.

### Runtime/tooling inventory

Observed in the available implementation environment:

```text
Node.js: 18.19.x
TypeScript compiler: 5.6.x
pnpm: unavailable
corepack: unavailable
repository checkout: unavailable
GitHub workflow dispatch through the connected tool: unavailable
```

The project requires Node.js 22 and pnpm. Therefore no package test, workspace typecheck, build, Playwright or official migration test is recorded as passed from this environment.

## GitHub status evidence

PR #24 is open as a draft. At the latest status query during this session, the branch had no reported commit statuses/check runs. The existing workflow exposes a manual dispatch, but the connected GitHub tool does not expose a workflow-dispatch action. No green CI state is inferred from the absence of failures.

## Pending mandatory gates

```text
pnpm install --frozen-lockfile
pnpm --filter @semogtw/contracts test
pnpm --filter @semogtw/contracts typecheck
pnpm --filter @semogtw/domain test
pnpm --filter @semogtw/domain typecheck
pnpm --filter @semogtw/database test
pnpm --filter @semogtw/database typecheck
pnpm check:boundaries
pnpm check:public-confidentiality
pnpm check
pnpm build
```

Web/Playwright gates remain pending until the owner-only DevOS Growth routes and UI are implemented.

## Security and data invariants preserved in code

- no direct goal percentage field or setter;
- no arbitrary achieved-skill setter;
- external/model provenance is metadata, never authorization;
- no AI provider required for core creation, templates, weights or progress;
- every private read is designed around an explicit owner ID;
- idempotency replay is payload-aware;
- domain write, history and audit are transactionally composed in SQLite repositories;
- event and alias histories are append-only;
- checkpoint reorder verifies the complete snapshot before mutation and rolls back on a stale member;
- backup migration expectations include `0015` while absent reserved migration `0014` is not falsely claimed.

## Current blockers

- official tests cannot run in the connected implementation environment;
- the PR currently has no automatic check result;
- DevOS runtime/authentication/CSRF composition must be integrated using existing helpers before any web mutation is exposed;
- public-confidentiality and mobile E2E remain unexecuted.

## Next implementation action

Integrate the private Growth read model and quick-create service into the existing DevOS runtime, add owner-authenticated/CSRF-protected server functions, then build the guided private route and focused tests without exposing Growth state to public loaders or DTOs.
