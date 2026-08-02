# Run ledger verification execution plan

**Goal:** Convert the cooperative run ledger from committed implementation/specification into observed, dependency-complete passage evidence without broadening remote transport scope.

## Starting point

Branch: `develop/foundation-bootstrap`

Read first:

- [`../../../RUN_LEDGER.md`](../../../RUN_LEDGER.md)
- [`../../AGENT_RUN_PROTOCOL.md`](../../AGENT_RUN_PROTOCOL.md)
- [`2026-08-01-semogtw-run-ledger-foundation.md`](./2026-08-01-semogtw-run-ledger-foundation.md)
- [`../../testing/2026-08-01-run-ledger-test-matrix.md`](../../testing/2026-08-01-run-ledger-test-matrix.md)
- [`../../verification/2026-08-01-run-ledger-implementation-review.md`](../../verification/2026-08-01-run-ledger-implementation-review.md)

Keep PR #1 draft until every required gate below is observed.

## Task 1: Environment and dependency integrity

1. fetch the exact current branch;
2. record `git rev-parse HEAD`;
3. record Node/Corepack/pnpm versions;
4. run `pnpm install --frozen-lockfile`;
5. confirm no lockfile mutation;
6. inspect resolved versions for TypeScript, Vitest, Drizzle, better-sqlite3, TanStack and Zod;
7. commit only intentional dependency/lockfile fixes.

Gate:

```bash
git status --short
pnpm install --frozen-lockfile
```

Expected: clean lockfile and successful native module installation.

## Task 2: First real typecheck

Run in this order:

```bash
pnpm --filter @semogtw/domain typecheck
pnpm --filter @semogtw/database typecheck
pnpm --filter @semogtw/web typecheck
```

Fix the first real diagnostic before guessing at later failures.

High-risk review points:

- discriminated-union construction in run server functions/forms;
- exact optional property behavior for heartbeat/checkpoint commands;
- Drizzle row enum inference for run/command tables;
- `better-sqlite3` transaction return typing;
- route IDs generated for `/devos/runs` files;
- browser/server boundary for `crypto.subtle` and imported types;
- `StatusTone` and button tone types;
- new package barrel exports.

Commit and push each coherent fix.

## Task 3: Focused domain tests

```bash
pnpm --filter @semogtw/domain test -- runs
```

When Vitest filtering differs, run the full domain suite.

Required coverage:

- state/freshness;
- registration;
- lifecycle service;
- checkpoints;
- command queue;
- command transitions;
- command inbox.

Do not alter invariants merely to satisfy an unexpected test; reconcile test, code and product contract.

## Task 4: Focused database tests

```bash
pnpm --filter @semogtw/database test -- cooperative-run
```

Required suites:

- migration/schema exports;
- registration/transition/checkpoint repositories;
- command queue/transition/inbox;
- delayed retry idempotency;
- immutable command fields;
- read model/malformed JSON;
- freshness/availability;
- backup migration expectations.

### Known edge case to resolve

Verify the tracked command-creation retry case:

1. create command;
2. acknowledge/complete/reject it;
3. retry original creation intent with the same idempotency key;
4. return duplicate/idempotent without reverting lifecycle;
5. changed original intent with the same key remains conflict.

The queued event is the immutable source for the original creation intent; mutable current command lifecycle fields must not invalidate the original retry.

## Task 5: Migration and backup execution

Run against both in-memory and disposable file-backed SQLite.

Verify:

- migrations `0001`–`0005` apply in order;
- repeat invocation is safe;
- four ledger tables/indexes/foreign keys exist;
- pre-ledger data remains readable;
- registration/checkpoint/command fixtures persist;
- backup creation and verification succeed;
- restored database contains both existing operational data and ledger fixtures.

Record database paths only when they contain no sensitive production data.

## Task 6: Full workspace gates

```bash
pnpm check
pnpm build
```

After every fix, rerun the smallest affected gate first, then full gates.

Do not use GitHub Actions unless local execution is genuinely impossible and the gate is essential. Document unavailable gates instead of creating routine CI consumption.

## Task 7: Browser gates

Start the application with disposable owner credentials and database.

Authenticated scenarios:

- register run;
- delayed retry does not duplicate;
- heartbeat, block, resume;
- rich checkpoint with each test status;
- every command kind;
- command expiration/availability labels;
- terminal transition removes forms;
- malformed historical rows render safely;
- two-tab optimistic conflict.

Anonymous scenarios:

- list/detail redirect to login;
- mutation RPCs fail closed;
- public pages/responses contain no run metadata.

Accessibility/responsive:

- keyboard-only flows;
- focus visibility;
- screen-reader status/freshness/availability distinction;
- 360×800 no horizontal overflow;
- long hashes/branches/payload JSON contained.

## Task 8: Documentation reconciliation

Update only after observed output:

- main changelog;
- testing/verification reports;
- run-ledger foundation plan checkboxes;
- PR #1 body;
- readiness estimate.

Include exact commit SHA, commands, exits and failures fixed. Do not replace the matrix with “all tests passed”.

## Task 9: Review decision

Keep draft if any of these remain:

- typecheck/test/build failure;
- migration/backup failure;
- anonymous confidentiality failure;
- authenticated workflow failure;
- 360 px/keyboard blocker;
- unresolved command retry edge case;
- high-severity security finding.

Mark ready only after all owner-web gates pass. Remote agent/MCP exposure remains a separate future plan even after owner-web readiness.

## Handoff format

```text
Branch and HEAD:
Environment versions:
Dependency install result:
Focused domain result:
Focused database result:
Migration/backup result:
Web typecheck/build result:
Authenticated browser result:
Anonymous/confidentiality result:
Responsive/accessibility result:
Known failures:
Commits pushed:
Exact next action:
```
