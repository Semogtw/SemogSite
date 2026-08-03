# Test Matrix — Workflow Orchestration Core

## Evidence rule

A committed test is a specification until an execution produces observed output. This matrix uses:

- `observed pass`: the command completed with zero failures on the referenced branch head;
- `observed failure`: the command exercised the code and found a failure;
- `environment blocked`: the code was not exercised because the environment was incomplete;
- `pending`: not yet executed against the current branch head.

No result is promoted from a previous commit when the covered files changed afterward.

## Current verified baseline

Workflow run `30829405975` on branch `develop/workflow-control-core` verified the detached recovery route and completed successfully through:

- reviewed CI-only native build of `better-sqlite3`;
- orchestration domain tests;
- domain typecheck;
- migrations, backup and orchestration SQLite repositories/read models;
- database typecheck;
- structural web controls;
- runtime-capability normalization tests;
- UI typecheck;
- TanStack route-tree generation and web typecheck;
- production web build;
- anonymous and authenticated Playwright checks;
- 360 px horizontal-overflow checks.

The next gate adds repository package-boundary and public-confidentiality scanners. Its result must be recorded separately when complete.

## Domain matrix

### Scope reservation model and lifecycle

| Case | Expected | Status |
|---|---|---|
| path normalization | canonical sorted unique patterns | observed pass |
| traversal/absolute path | rejected | observed pass |
| unsafe Git branch | rejected | observed pass |
| same repo/branch overlapping scope | overlap reported | observed pass |
| another repository or branch | no overlap | observed pass |
| expired/released/overridden reservation | does not overlap | observed pass |
| acquire without overlap | active version 1 + audit | observed pass |
| unacknowledged overlap | conflict, no write | observed pass |
| acknowledged overlap | write + overlap IDs | observed pass |
| retry with stable intent | one entity/event | observed pass |
| changed idempotency reuse | conflict | observed pass |
| renew/release wrong run | rejected | observed pass |
| owner override | reason + confirmation required | observed pass |
| context entity mismatch | validation before repository access | observed pass |
| optimistic stale state | no write | observed pass |

### Verification obligations

| Case | Expected | Status |
|---|---|---|
| exact 40-character SHA | pending version 1 | observed pass |
| abbreviated/nonhex SHA | rejected | observed pass |
| missing capability/next action | rejected | observed pass |
| pass with classification | rejected | observed pass |
| fail/block without classification | rejected | observed pass |
| classified failure | deterministic signature | observed pass |
| unsafe evidence URL | rejected | observed pass |
| stale expected version | no write | observed pass |
| terminal mutation | rejected | observed pass |
| supersede | terminal + audit | observed pass |
| waiver without confirmation | rejected | observed pass |
| context entity mismatch | validation before repository access | observed pass |

### Recovery snapshots

| Case | Expected | Status |
|---|---|---|
| unordered equivalent input | identical canonical JSON | observed pass |
| exact branch/SHA | preserved | observed pass |
| invalid/future timestamp or SHA | rejected | observed pass |
| unsafe document path | rejected | observed pass |
| credential-shaped text | rejected | observed pass |
| output over size bound | rejected | observed pass |
| valid SHA-256 hasher | immutable record + audit | observed pass |
| invalid hash output | no persistence | observed pass |
| duplicate canonical hash | no extra row | observed pass |
| branch without observation | fail closed | observed pass |
| immutable history ordering | newest first, bounded | observed pass |

### Safe-work evaluator

| Case | Expected | Status |
|---|---|---|
| executable candidates | deterministic ranking | observed pass |
| incomplete dependency | excluded | observed pass |
| owner decision/manual lock | excluded | observed pass |
| missing runtime capability | excluded with details | observed pass |
| active scope conflict | excluded with reservation IDs | observed pass |
| expired reservation | ignored | observed pass |
| unresolved stage gate | prerequisite exclusion | observed pass |
| stale/invalid source | no invented ranking | observed pass |
| later roadmap stage | previous-stage exclusion | observed pass |
| zero/multiple active repositories | explicit source exclusion | observed pass |
| explicit capability normalization | lowercase, unique, sorted | observed pass |
| empty capability input | conservative empty set | observed pass |

## Database matrix

### Migrations and backup

| Case | Expected | Status |
|---|---|---|
| fresh database | applies `0001`–`0013` in order | observed pass |
| repeated migrate | idempotent | observed pass |
| reservation tables/events | present with constraints | observed pass |
| obligation tables/events | present with exact-SHA constraints | observed pass |
| recovery snapshot table | immutable canonical storage | observed pass |
| malformed versions/SHA/JSON | rejected by constraints | observed pass |
| restored backup | migrations/data/integrity verified | observed pass |

### Transactional repositories

Observed passing behavior includes:

- entity, domain event and global audit written atomically;
- stable retries mapped to duplicate;
- changed retries mapped to conflict;
- optimistic compare-and-swap updates;
- missing project/repository/run/stage classification;
- no partial rows after a reference, event or audit failure;
- JSON arrays round-trip conservatively;
- recovery canonical JSON, Markdown and hash preserved byte-for-byte.

### Read models and sources

Observed passing behavior includes:

- reservation freshness derived from the requested observation time;
- unresolved and environment-blocked obligation counts;
- accepted branch and latest matching GitHub observation only;
- no fabricated recovery SHA;
- immutable recovery history bounded to 1–100 rows;
- first unfinished roadmap stage only;
- ambiguous repository relationships excluded rather than guessed;
- seed demonstration projects excluded from safe-work recommendations.

## Web/server matrix

### Authentication and confidentiality

| Case | Expected | Status |
|---|---|---|
| anonymous `/devos/workflows` | redirect to login before private content | observed pass |
| anonymous recovery route | redirect to login before private content | observed pass |
| public homepage | no workflow-only labels | observed pass |
| private reads | resolve owner server-side | observed pass by structural test |
| mutations | CSRF + owner + confirmation | observed pass by structural/typecheck gates |
| private metadata | `noindex, nofollow, noarchive` | observed pass by structural test |
| public confidentiality scanner | no private marker leakage | pending current gate |
| package boundary scanner | no forbidden cross-surface imports | pending current gate |

### Workflow controls

Observed passing structural/typecheck coverage:

- scope creation uses persisted repository targets and effective branch;
- active reservations expose owner override only;
- terminal obligations hide the result form;
- pass sends no failure classification;
- fail/block requires explicit classification;
- stale versions produce safe refresh guidance;
- recovery route is a sibling route (`devos.workflows_.recovery.tsx`) so it renders without requiring an `<Outlet>` in the dashboard;
- recent immutable snapshots expose canonical hash and selectable Markdown fallback;
- safe-work defaults to no capabilities;
- explicit capability evaluation is session-only and does not mutate persistent state.

### Browser and responsive coverage

Workflow run `30829405975` observed:

- anonymous redirect for dashboard and recovery routes;
- absence of workflow labels on the public homepage;
- owner login followed by authenticated navigation to the dashboard;
- navigation from the dashboard to recovery history;
- recovery heading/history rendered on the detached route;
- no horizontal document overflow at a 360 × 800 viewport on both private routes.

Still pending:

- keyboard-only mutation flows;
- actual reservation/gate/snapshot write interaction in Playwright;
- clipboard-denied browser simulation;
- visual screenshot review at desktop and mobile widths.

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
pnpm --filter @semogtw/web build
pnpm exec playwright test tests/e2e/workflow-orchestration.spec.ts
```

The focused CI appends `onlyBuiltDependencies: [better-sqlite3]` only to the discarded runner checkout before installation. The committed workspace supply-chain policy is not broadened.

## Merge acceptance still required

Before merge, preserve evidence for:

1. boundary and public-confidentiality scanners on the current head;
2. full root `pnpm check` or explicit documented classification of unrelated failures;
3. final production build after documentation/cleanup changes;
4. removal of one-shot patch executors from the merge result;
5. rollback and migration-backup procedure review.
