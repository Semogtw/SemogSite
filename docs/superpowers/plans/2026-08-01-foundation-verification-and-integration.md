# Foundation verification and integration plan

**Goal:** Convert the current Semogtw foundation PR from broad committed implementation into observed, reviewable evidence while resolving known run-ledger/editorial integration blockers. Do not broaden remote/public scope during this plan.

## Starting state

Branch: `develop/foundation-bootstrap`

PR #1 remains draft.

Implemented but not fully verified:

- operational DevOS and GitHub observations;
- internal read-only MCP;
- cooperative run ledger;
- private editorial domain/persistence foundation.

## Phase 1: Exact environment and package wiring

1. fetch branch and record `git rev-parse HEAD`;
2. record Node/Corepack/pnpm versions;
3. run frozen-lockfile install;
4. confirm lockfile remains clean;
5. export editorial modules through root domain/database/contracts barrels;
6. export editorial Drizzle schema through composed schema index;
7. export new run-ledger derived availability and guardrail commands where pending;
8. do not use cross-package relative imports as a permanent fix.

Gate:

```bash
pnpm install --frozen-lockfile
git status --short
```

## Phase 2: Node-native guardrails

Run before TypeScript so public/privacy regressions fail quickly:

```bash
node scripts/check-security-guardrails.mjs
node scripts/check-run-ledger-guardrails.mjs
node scripts/check-editorial-guardrails.mjs
```

Then integrate the verified new scanners into the canonical root guardrail/check scripts without dropping existing checks.

## Phase 3: Focused typecheck

```bash
pnpm --filter @semogtw/domain typecheck
pnpm --filter @semogtw/contracts typecheck
pnpm --filter @semogtw/database typecheck
pnpm --filter @semogtw/mcp typecheck
pnpm --filter @semogtw/mcp-app typecheck
pnpm --filter @semogtw/web typecheck
```

Fix first observed diagnostic and commit frequently.

High-risk points:

- root barrel/export paths;
- discriminated unions in browser/server forms;
- Drizzle enum/boolean inference;
- transaction return typing;
- editorial trigger/schema mismatch;
- editorial revision sequence API;
- corrected public read-model adoption;
- MCP SDK/Zod installed generics.

## Phase 4: Focused tests

```bash
pnpm --filter @semogtw/domain test
pnpm --filter @semogtw/contracts test
pnpm --filter @semogtw/database test
pnpm --filter @semogtw/mcp test
pnpm --filter @semogtw/mcp-app test
```

Resolve known blockers with regression tests:

### Run ledger

- command creation retry after command consumption;
- transition/checkpoint stable request fingerprint;
- inbox over-limit/out-of-order adapter defense;
- repository timestamp fail-closed behavior;
- source-hash semantics.

### Editorial

- remove synthetic approval ID from publish/rollback lookup;
- exact retry after later document transitions without rewind;
- stable request fingerprint;
- pure revision sequence explicitly supplied by repository;
- remove provisional public source;
- persisted review/publication event correctness.

## Phase 5: Migration and trigger execution

Execute migrations `0001`–`0009`:

- fresh in-memory database;
- fresh file-backed database;
- existing pre-`0005` fixture upgraded to `0009`;
- repeated migration call.

Verify:

- run-ledger and editorial tables/indexes/triggers;
- old operational/GitHub data preserved;
- trigger error cases;
- SQLite foreign key/integrity checks;
- migration list/backup expectations updated.

## Phase 6: Backup/restore

File-backed fixture must include:

- existing project, session/evidence and GitHub observation;
- run, checkpoint and command;
- editorial published revision A;
- editorial private draft B;
- review/publication history.

Create verified backup, restore separately and prove:

- owner read models contain all private history;
- public editorial adapter exposes only revision A with publication timestamp;
- run command availability/freshness derive correctly;
- triggers and migrations remain installed;
- no public/private cross-contamination.

## Phase 7: Full gates

```bash
pnpm check
pnpm build
```

Rerun after every material fix. GitHub Actions remain a last resort, not the default execution path.

## Phase 8: Browser verification

### Existing DevOS/run ledger

- owner auth/CSRF;
- register/transition/checkpoint/command;
- retries/conflicts;
- terminal behavior;
- anonymous redirect/confidentiality;
- keyboard and 360×800.

### Editorial owner UI

Implement only after Phases 1–7 pass:

- private list/detail/editor/preview;
- submit/reopen/review/approve;
- publish/withdraw/rollback;
- diff/hash/checklist visibility;
- no owner/operational data in public loaders.

### Public editorial routes

Implement after renderer security gates:

- strict published-only adapter/DTO;
- draft/withdrawn not found;
- canonical/meta/cache behavior;
- markdown XSS/link/CSP tests;
- private draft does not alter public content/timestamp.

## Phase 9: Documentation and review status

Update with observed results:

- changelog;
- main test/verification docs;
- plan checkboxes;
- PR body/readiness percentages;
- exact commit/environment/commands/failures/fixes.

Mark PR ready only when:

- no focused/full gate failure;
- migrations/backup pass;
- anonymous confidentiality passes;
- existing owner workflows pass;
- no high-severity issue remains.

Editorial public release and remote agent/MCP deployment remain later approvals even if the foundation PR becomes reviewable.

## Handoff template

```text
Branch and HEAD:
Environment versions:
Install/lockfile:
Guardrails:
Domain/contracts/database typecheck:
Focused tests:
Migrations 0001–0009:
Backup/restore:
Full check/build:
Authenticated browser:
Anonymous confidentiality:
Responsive/accessibility:
Known blockers:
Commits pushed:
Exact next action:
```
