# Test Matrix — Workflow Orchestration Core

## Evidence rule

A committed test is a specification until execution produces output.

- `observed pass`: command completed with zero failures on the referenced head;
- `observed failure`: code was exercised and a failure was found;
- `environment blocked`: code was not exercised because the environment was incomplete;
- `pending`: not executed against the current head.

Do not promote results from an older commit after covered code changes.

## Verified baseline

Workflow run `30841132598` completed successfully on August 3, 2026 for commit `94956d10f805e13af7f11e5e2e4f63e8e4abe4b8`.

| Layer | Observed result |
|---|---|
| frozen install + `better-sqlite3` native artifact | pass |
| package boundaries | pass, 84 domain files scanned |
| public confidentiality | pass, 15 public files scanned |
| focused orchestration domain | 7 files, 34 tests pass |
| focused orchestration database | 10 files, 33 tests pass |
| focused web controls | 2 files, 8 tests pass |
| all workspace typechecks | pass |
| root `pnpm check` | 151 files, 576 tests pass |
| production client/SSR build | pass |
| migration assets | 13 server-side, zero client-side |
| focused Playwright | 6 tests pass |

Documentation commits after that run require a final complete run before merge.

## Domain matrix

### Scope reservations

| Case | Expected | Status |
|---|---|---|
| normalize/sort/deduplicate patterns | canonical patterns | observed pass |
| traversal, absolute path or unsafe branch | reject | observed pass |
| same repository/branch overlapping scope | report conflict | observed pass |
| different repository/branch | no conflict | observed pass |
| expired/released/overridden lease | no active conflict | observed pass |
| acquire without overlap | active version 1 + event/audit | observed pass |
| overlap without acknowledgement | no write | observed pass |
| acknowledged overlap | write with overlap IDs | observed pass |
| stable idempotent retry | no duplicate entity/event | observed pass |
| changed idempotency reuse | conflict | observed pass |
| renew/release with wrong run | reject | observed pass |
| owner override | reason + confirmation + history | observed pass |
| context entity mismatch | reject before repository access | observed pass |
| stale expected version | no write | observed pass |

### Verification obligations

| Case | Expected | Status |
|---|---|---|
| full 40-character SHA | pending version 1 | observed pass |
| abbreviated/nonhex SHA | reject | observed pass |
| missing capability/next action | reject | observed pass |
| passed result with failure class | reject | observed pass |
| failed/blocked without class | reject | observed pass |
| classified result | deterministic signature/event/audit | observed pass |
| unsafe evidence URL | reject | observed pass |
| stale version | no write | observed pass |
| mutate terminal obligation | reject | observed pass |
| supersede | terminal + audit | observed pass |
| waiver without confirmation | reject | observed pass |
| context entity mismatch | reject before repository access | observed pass |

### Recovery snapshots

| Case | Expected | Status |
|---|---|---|
| semantically equivalent unordered input | identical canonical JSON/hash | observed pass |
| exact branch/SHA | preserve | observed pass |
| invalid/future timestamp or SHA | reject | observed pass |
| unsafe path or credential-shaped text | reject | observed pass |
| Markdown over bound | reject | observed pass |
| valid SHA-256 hasher | immutable row + audit | observed pass |
| invalid hash output | no persistence | observed pass |
| duplicate canonical hash | no extra row | observed pass |
| active branch without observation | fail closed | observed pass |
| history ordering/limit | newest first, bounded | observed pass |

### Safe work

| Case | Expected | Status |
|---|---|---|
| executable candidates | deterministic ranking | observed pass |
| incomplete dependency | exclusion | observed pass |
| owner lock | exclusion | observed pass |
| missing runtime capability | exclusion with details | observed pass |
| active overlapping reservation | exclusion with IDs | observed pass |
| expired reservation | ignored | observed pass |
| unresolved stage gate | prerequisite exclusion | observed pass |
| stale/invalid source | no invented ranking | observed pass |
| later roadmap stage | previous-stage exclusion | observed pass |
| zero/multiple active repositories | explicit source exclusion | observed pass |
| explicit capability input | lowercase, unique, sorted | observed pass |
| empty input | conservative empty set | observed pass |

## Database matrix

| Case | Expected | Status |
|---|---|---|
| fresh database | migrations `0001`–`0013` in order | observed pass |
| repeated migrate | idempotent | observed pass |
| reservation/event constraints | present | observed pass |
| obligation/exact-SHA constraints | present | observed pass |
| immutable canonical snapshots | present | observed pass |
| malformed versions/SHA/JSON | constraint rejection | observed pass |
| entity/event/audit atomicity | rollback on companion write failure | observed pass |
| backup/restore | integrity, foreign keys, migrations and data | observed pass |
| accepted branch lookup | matching persisted observation only | observed pass |
| recovery history | bounded 1–100 | observed pass |
| roadmap source | first unfinished stage only | observed pass |
| ambiguous repository | exclude rather than guess | observed pass |
| demonstration seed | excluded from safe-work recommendations | observed pass |

## Web/server matrix

| Case | Expected | Status |
|---|---|---|
| anonymous workflow dashboard | redirect before private content | observed pass |
| anonymous recovery route | redirect before private content | observed pass |
| public homepage | no workflow-only labels | observed pass |
| private reads | resolve owner server-side | observed pass |
| mutations | owner + CSRF + confirmation | observed pass |
| noindex metadata | private routes excluded from indexing | observed pass |
| package-boundary scanner | no forbidden imports | observed pass |
| public-confidentiality scanner | no private marker leakage | observed pass |
| active reservation | override form visible | observed pass |
| overridden reservation | override form gone, inactive view | observed pass |
| nonterminal gate | result form visible | observed pass |
| blocked gate | `environment_missing` preserved | observed pass |
| recovery route | sibling file route renders at same URL | observed pass |
| snapshot history | hash + selectable Markdown fallback | observed pass |
| safe-work initial read | no invented capabilities | observed pass |
| explicit capability evaluation | session-only response | observed pass |

## Browser and responsive matrix

Run `30841132598` observed six passing scenarios:

1. anonymous redirect for dashboard and recovery routes;
2. no workflow-only labels on the public homepage;
3. owner login and dashboard → recovery navigation;
4. safe-work re-evaluation with explicitly typed capabilities;
5. no horizontal overflow at 360 × 800 on both private routes;
6. real UI mutations against an isolated SQLite database:
   - register `Semogtw/E2EWorkflow` as a private target;
   - create a reservation;
   - create an exact-SHA verification obligation;
   - owner-override the reservation and preserve history;
   - record `blocked` with `environment_missing`;
   - attempt recovery without a persisted GitHub observation;
   - observe fail-closed guidance and empty snapshot history.

Still pending for a later hardening phase:

- clipboard-denied browser simulation;
- visual screenshot review beyond overflow checks;
- keyboard-only execution of every sensitive mutation;
- successful snapshot creation through Playwright using a persisted synthetic branch observation;
- live provider/token behavior on the selected deployment host.

## Focused commands

```bash
pnpm check:boundaries
pnpm check:public-confidentiality
pnpm --filter @semogtw/domain exec vitest run src/orchestration
pnpm --filter @semogtw/domain typecheck

pnpm --filter @semogtw/database exec vitest run \
  src/orchestration-migrations.test.ts \
  src/repositories/scope-reservation-repository.test.ts \
  src/repositories/verification-obligation-repository.test.ts \
  src/repositories/recovery-snapshot-read-model.test.ts \
  src/repositories/recovery-snapshot-repository.test.ts \
  src/repositories/recovery-snapshot-source.test.ts \
  src/repositories/safe-work-source.test.ts \
  src/repositories/workflow-orchestration-read-model.test.ts \
  src/adapters/sqlite-migrations.test.ts \
  src/backup/sqlite-backup.test.ts

pnpm --filter @semogtw/database typecheck
pnpm --filter @semogtw/ui typecheck
pnpm --filter @semogtw/web typecheck
pnpm check
pnpm --filter @semogtw/web build
node scripts/prepare-e2e.mjs
pnpm exec playwright test tests/e2e/workflow-orchestration.spec.ts
```

The focused CI appends the `better-sqlite3` allowlist only to the discarded runner checkout.

## Merge acceptance remaining

1. final complete gate on the documentation-reconciled head;
2. update PR #14 with that final run ID and exact head;
3. preserve a compatible backup/rollback target for the selected host;
4. ensure one-shot patch executors are absent from the final integration via cleanup PR #18 or equivalent reviewed merge.