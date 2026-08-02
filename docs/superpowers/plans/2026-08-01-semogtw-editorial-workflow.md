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
- slug changes require a separately reviewed redirect policy and are not part of initial editing.

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

- [x] Add additive editorial workflow migrations (`0006`–`0009`).
- [x] Add document, immutable revision, review and publication-event tables.
- [x] Keep public projection query independent from private operational tables.
- [x] Use immediate transactions, idempotency keys and optimistic `updated_at` matching.
- [x] Preserve publication history (redirect decisions remain future work).
- [x] Update migration expectations through `0009`.

## Task 3: Owner-only editorial UI

- [x] Add private document list/detail/editor routes.
- [ ] Add revision diff; authenticated preview is implemented.
- [x] Add sensitive-review checklist and approval reason.
- [x] Add publish/withdraw/rollback confirmation flows.
- [x] Add responsive and keyboard-operable editor controls; browser verification remains pending.
- [x] Never expose review/draft payloads through public loaders.

## Task 4: Public reads

- [x] Add public read model backed only by current published revision.
- [x] Map to explicit strict public contracts.
- [x] Return not-found for draft/withdrawn/unknown content.
- [ ] Add canonical/noindex behavior and approved redirects.
- [x] Add public confidentiality scanner coverage for editorial/private fields.

## Task 5: Verification

- [x] Domain lifecycle/content-bound tests.
- [x] SQLite atomicity/idempotency/rollback tests.
- [x] Migration `0001`–`0009` memory/file execution.
- [ ] Backup/restore with editorial fixtures.
- [ ] Owner browser edit/review/publish/withdraw/rollback flow.
- [ ] Anonymous draft/review confidentiality tests.
- [ ] Markdown sanitization/XSS and external-link tests.
- [ ] Keyboard and 360 px review.
- [ ] Full `pnpm check` and build.

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

## Execution update — 2026-08-02

Implemented and observed on `develop/editorial-workspace`:

- owner creation, immutable revisions, submit-for-review, approval checklist, explicit re-open, publication, withdrawal and rollback;
- replay-first idempotency for transitions, approval, publication/rollback and withdrawal, including lost-response retries after aggregate state changes;
- approval and rollback bound to the exact persisted revision/content hash;
- public lifecycle controls remain available while a newer working draft exists, so an older public projection can always be withdrawn or rolled back;
- strict public editorial reader backed only by `SqlitePublishedEditorialReadModel`;
- `/notes` and `/notes/$slug` now read only the current published `note` revision and return not-found for drafts, withdrawals and kind mismatches;
- approved Markdown is currently emitted as escaped text, not HTML. A sanitized renderer remains a separate security gate.

Observed offline-toolchain gates at local commit `ac51b3d`:

```text
Node v22.23.1
pnpm 10.14.0
@semogtw/domain: 35 files / 199 tests passed
@semogtw/database: 45 files / 119 tests passed
@semogtw/contracts: 2 files / 10 tests passed
@semogtw/web: 23 files / 62 tests passed
domain, database, contracts and web typechecks passed
git diff --check passed
```

Still required before phase 1 can be declared complete:

- migrate `/projects` away from its legacy operational public-field source to the editorial projection;
- sanitized Markdown renderer and URI/link policy;
- canonical/redirect policy;
- browser flow, keyboard and 360×800 verification;
- file-backed backup/restore fixture;
- full root `pnpm check` and production build on the final exact remote HEAD.
