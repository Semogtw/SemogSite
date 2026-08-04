# Learning Growth Core — implementation evidence

## Scope

This record covers `develop/learning-growth-core-implementation`, stacked on PR #23. It separates implemented behavior, supplemental observations and mandatory gates that still require an executable project checkout.

## Implemented slices

### Domain and persistence

- provider-neutral goal, checkpoint and skill contracts;
- strict normalization and validation;
- progress derived only from checkpoint state and weights;
- indeterminate progress when no measurable checkpoint exists;
- goal, checkpoint and skill lifecycle services;
- deterministic integer checkpoint weights totaling 100;
- five versioned deterministic goal templates;
- truthful private assistance provenance;
- manual/template quick-create preparation and atomic service envelope;
- migration `0015_learning_goals.sql` with explicit `automatic`/`custom` checkpoint weight modes;
- transactional SQLite repositories for goals, checkpoints, skills and quick creation;
- owner-scoped private Growth read model;
- backup/restore coverage additions;
- explicit `@semogtw/domain/growth` and `@semogtw/database/growth` package surfaces.

### Owner-only web experience

- composition with the existing owner session, CSRF and node-database helpers;
- private `/devos/growth` overview route;
- private `/devos/growth/$goalId` detail route;
- `noindex, nofollow, noarchive` metadata on both routes;
- guided quick creation with title as the only mandatory field;
- deterministic template preview with no model dependency;
- honest progress and indeterminate states;
- advanced checkpoint details kept behind disclosure controls;
- Growth entry in desktop and mobile DevOS navigation;
- Roadmap access preserved through the mobile “Mais” route;
- Growth stylesheet loaded through the root route.

### Server-derived checkpoint weight rebalance

- canonical `CheckpointWeightMode` contract;
- automatic modes persisted for template checkpoints and preserved across quick-create replay;
- preview calculated from the current owner-scoped server snapshot;
- apply payload accepts only target identity, expected versions, reason and confirmation;
- browser-proposed `weight`, `weightMode` and `proposedWeights` are rejected by strict schemas;
- custom-weight changes require explicit confirmation;
- optimistic concurrency checks the exact goal/checkpoint version set;
- semantic idempotency replays the first successful result before stale-version evaluation;
- all checkpoint changes, append-only events and aggregate audit commit in one `IMMEDIATE` transaction;
- route invalidates and reloads the server-derived state after a successful apply.

### Added verification code

- domain service tests for server-derived preview, confirmation and conflicts;
- SQLite repository tests for owner isolation, atomicity, events, audit and replay;
- migration/schema tests for weight-mode constraints;
- package public-surface tests;
- web handler tests proving auth/CSRF ordering;
- strict server-schema tests rejecting client-proposed weights;
- structural route/confidentiality/navigation tests;
- Playwright specification covering anonymous redirects, public confidentiality, template creation, detail navigation, rebalance and 360 px viewport behavior.

## Verification actually executed in the implementation session

### Supplemental SQLite validation

The original Growth migration was applied with Python's standard `sqlite3` library in an in-memory database after applying the preceding committed migrations. That supplemental check observed:

- all eight Growth tables created;
- foreign keys enabled;
- contiguous event-sequence trigger rejecting a skipped sequence;
- immutable-event trigger rejecting update/delete;
- no canonical goal-percentage column.

Classification: `supplemental_environment`. This does not replace the repository's `better-sqlite3`, Drizzle and Vitest gates. The later weight-mode and route/rebalance changes have not been executed in that supplemental harness.

### Runtime/tooling inventory

Observed in the connected implementation environment:

```text
Node.js: 18.19.x
TypeScript compiler: 5.6.x
pnpm: unavailable
corepack: unavailable
repository checkout: unavailable
outbound github.com DNS resolution: unavailable
GitHub workflow dispatch through the connected tool: unavailable
```

The project requires Node.js 22 and pnpm. No package test, workspace typecheck, build, Playwright run or official migration test is recorded as passed for the current head from this environment.

## GitHub status evidence

PR #24 remains open as a draft and mergeable. The latest queried head had no pull-request workflow runs or combined status evidence. The connector can inspect existing runs but cannot dispatch the repository's manual workflow. Absence of a failure is not treated as a green gate.

## Pending mandatory gates

```text
pnpm install --frozen-lockfile
pnpm --filter @semogtw/contracts test
pnpm --filter @semogtw/contracts typecheck
pnpm --filter @semogtw/domain test
pnpm --filter @semogtw/domain typecheck
pnpm --filter @semogtw/database test
pnpm --filter @semogtw/database typecheck
pnpm --filter @semogtw/ui test
pnpm --filter @semogtw/ui typecheck
pnpm --filter @semogtw/web test
pnpm --filter @semogtw/web typecheck
pnpm check:boundaries
pnpm check:public-confidentiality
pnpm check
pnpm build
pnpm exec playwright test tests/e2e/growth-owner-experience.spec.ts
```

## Security and data invariants preserved in code

- no direct goal-percentage field or setter;
- no arbitrary achieved-skill setter;
- no generic database, filesystem, shell or HTTP mutation surface;
- external/model provenance is metadata, never authorization;
- no AI provider is required for creation, templates, weights or progress;
- private routes resolve the owner before opening Growth storage;
- mutations validate CSRF before opening Growth storage;
- private reads are owner-scoped;
- idempotency replay is semantic and payload-aware;
- domain writes, history and audit are transactionally composed;
- event and alias histories are append-only;
- checkpoint reorder verifies the complete snapshot before mutation;
- rebalance recomputes weights server-side and rejects client-proposed values;
- changes to custom weights require confirmation;
- Growth labels and controls are guarded from public surfaces;
- reserved migration `0014` remains absent and is not falsely claimed.

## Current blockers

- official gates cannot run without a Node 22/pnpm project checkout;
- the current PR head has no automatic workflow result;
- the new Playwright specification is implemented but unexecuted;
- visual behavior on the real route remains unobserved until a browser gate runs.

## Next implementation action

Perform a final static review of the current PR diff, resolve any package-boundary or exact-fixture inconsistencies, update the PR description, and keep the PR draft until the mandatory test/typecheck/build/Playwright evidence is attached to the exact head SHA.
