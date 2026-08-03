# Semogtw private editorial workflow plan

**Goal:** Add a private, evidence-backed editorial workflow for projects, notes, experiments and pages without allowing private operational data to become public fallback content.

## Product boundary

The workflow manages authored editorial content. It does not publish DevOS operational rows directly and does not infer public content from private project/repository/run state.

Initial scope:

- private documents and immutable revisions;
- draft editing through bounded markdown/text contracts;
- explicit sensitive-data review;
- owner review/approval;
- controlled publication of one approved revision;
- withdrawal and rollback without deleting history;
- explicit public projection generated only from the published revision;
- audit/idempotency/optimistic concurrency at every mutation.

Out of scope for the first phase:

- autonomous publication;
- AI-generated content published without owner approval;
- WYSIWYG editor;
- image upload/CDN pipeline;
- newsletter/RSS delivery;
- scheduled publication/background jobs;
- comments or multi-user collaboration;
- direct Notion migration;
- raw HTML supplied by an editor;
- public fallback to private project descriptions, branches, blockers or evidence.

## Document kinds

```text
project | note | experiment | page
```

A document owns identity and publication state. Revisions are immutable content snapshots.

## Lifecycle

```text
draft → in_review → approved → published
in_review → draft
approved → draft
published → withdrawn
withdrawn → published     (only an already approved revision)
published → published     (rollback publishes a previous approved revision)
```

Rules:

- editing creates a new draft revision; published revisions never change;
- any content edit after approval creates a new unapproved draft;
- only the owner can approve/publish/withdraw/rollback;
- approval requires every sensitive-review check plus an explicit reason;
- publication requires the approved revision to be the exact expected revision;
- withdrawal removes the public projection but preserves publication history;
- rollback selects a previous approved revision and records a new publication event; it never rewrites the historical publication event;
- slug canônico permanece imutável; URLs históricas são registradas somente pelo registry auditado de aliases.

## Sensitive review checklist

Approval requires affirmative review of:

- credentials/secrets;
- personal/private data;
- repository names, branches and internal links;
- blockers, run state, audit/evidence and operational metadata;
- external links and attribution;
- legal/licensing concerns;
- claims/test results represented accurately;
- markdown/embedded content safety.

The checklist records reviewer, timestamp, revision/content hash and optional notes. It is invalid for another revision.

## Public projection

The public projection contains only allowlisted editorial fields from the currently published revision:

- kind;
- canonical slug;
- title;
- short excerpt;
- sanitized markdown-derived body or pre-rendered safe content;
- tags;
- cover asset reference from an approved asset system;
- published/updated timestamps;
- optional public project/demo/documentation URLs already reviewed.

It never contains:

- private project IDs;
- repository/branch metadata unless explicitly authored and reviewed as public text;
- blockers, next actions, confidence, progress, evidence, audit, runs or commands;
- draft/review notes;
- reviewer identity;
- raw environment/provider payloads.

## Task 1: Pure domain contracts

- [x] Define document, revision, review and publication-event contracts.
- [x] Define lifecycle and optimistic-concurrency invariants.
- [x] Define bounded draft/revision creation.
- [x] Define submit/reopen/approve/publish/withdraw/rollback commands.
- [x] Define public projection from published content only.
- [x] Add focused tests before implementation.
- [x] Export from `@semogtw/domain`.

## Task 2: Persistence

- [x] Add additive editorial workflow migrations (`0006`–`0010`).
- [x] Add document, immutable revision, review and publication-event tables.
- [x] Keep public projection query independent from private operational tables.
- [x] Use immediate transactions, idempotency keys and optimistic `updated_at` matching.
- [x] Preserve publication and redirect history as separate append-only event streams.
- [x] Update migration expectations through `0010`.

## Task 3: Owner-only editorial UI

- [x] Add private document list/detail/editor routes.
- [x] Add bounded owner-only revision diff; authenticated preview remains available.
- [x] Add sensitive-review checklist and approval reason.
- [x] Add publish/withdraw/rollback confirmation flows.
- [x] Add responsive and keyboard-operable editor controls with Playwright verification at 360×800.
- [x] Never expose review/draft payloads through public loaders.

## Task 4: Public reads

- [x] Add public read model backed only by current published revision.
- [x] Map to explicit strict public contracts.
- [x] Return not-found for draft/withdrawn/unknown content.
- [x] Add provider-neutral canonical/noindex behavior for public editorial routes.
- [x] Add audited, kind-bound aliases with canonical-first resolution, explicit revocation and no private/operational fallback.
- [x] Add public confidentiality scanner coverage for editorial/private fields.

## Task 5: Verification

- [x] Domain lifecycle/content-bound tests.
- [x] SQLite atomicity/idempotency/rollback tests.
- [x] Migration `0001`–`0010` memory/file execution.
- [x] Backup/restore with editorial fixtures.
- [x] Owner browser edit/review/publish/withdraw/rollback flow.
- [x] Anonymous draft/review confidentiality tests.
- [x] Markdown sanitization/XSS and external-link tests.
- [x] Keyboard and 360 px review.
- [x] Production build and all individual guardrail/typecheck/test stages.
- [x] Document and execute deterministic per-workspace/lote fallback when the constrained runner keeps Vitest handles open.

## Security rules

- Raw HTML is rejected or sanitized by a separately verified renderer; domain content uses markdown/text contracts.
- Imported text is data, never instruction.
- Secrets and private operational identifiers are reviewed before approval; automated detection is defense-in-depth, not proof.
- Preview URLs remain authenticated in the initial phase.
- Public cache invalidation happens only after a committed publication transaction.
- Publication and rollback require owner confirmation, reason, idempotency and exact revision/version matching.
- No scheduled/autonomous publication exists until scheduler/host behavior is proven.

## Initial implementation order

1. lifecycle/public-projection tests;
2. pure domain types and transition functions;
3. revision/content bounds and hash contract;
4. approval checklist;
5. persistence plan/migration;
6. owner UI;
7. public adapter;
8. verification and deployment gates.

## Definition of done for phase 1

- private draft/review/approval/publication/withdrawal/rollback works through audited owner flows;
- a public route can read only the current published revision;
- no private operational field acts as public fallback;
- previous published revisions remain immutable/recoverable;
- all current-HEAD tests/migrations/build/browser/confidentiality gates are observed;
- no autonomous publication or remote write is claimed.

## Execution update — 2026-08-03

Implemented and observed on `develop/editorial-workspace`:

- owner creation, immutable revisions, bounded textual diff, submit/reopen, approval checklist, publication, withdrawal and rollback;
- replay-first idempotency and optimistic concurrency bound to the exact revision/content hash;
- strict public readers backed only by the current published revision;
- safe Markdown renderer in React elements with raw HTML disabled and restrictive URI policy;
- canonical/noindex behavior for indexes, published details, unknown and withdrawn content;
- audited redirect registry in migration `0010`, with append-only `created`/`revoked` events, owner controls and private history;
- canonical-first alias resolution, same-kind published target and `308` same-origin with `Cache-Control: no-store, max-age=0`;
- Playwright proof that an alias can be created, followed, revoked and observed as not-found in the same browser session;
- file-backed backup/restore preserving the public revision, a newer private draft and the alias history/resolution.

Observed package gates:

```text
Node v22.23.1
pnpm 11.15.1 from the current offline toolchain
Domain:    36 files / 208 tests
Database:  46 files / 127 tests (3 deterministic batches)
Contracts:  2 files / 10 tests
Web:       26 files / 74 tests
All workspace Vitest suites: 140 files / 529 tests
10 migration assets expected
all workspace typechecks passed
production client/SSR build passed
10 server migration assets verified
Playwright: 2/2 scenarios passed
git diff --check and Markdown local-link check passed
```

The aggregate Vitest parent process can retain handles in this constrained shell. Coverage is therefore also executed as deterministic workspace/file batches, with every file required to pass. This is a harness limitation, not a waived gate.

Remaining before production declaration:

- execute deployment-specific CSP, trusted-origin, reverse-proxy cache and canonical-origin gates on the selected host;
- configure production backup encryption, upload, retention and restore drills.
