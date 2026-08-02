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

- [ ] Define document, revision, review and publication-event contracts.
- [ ] Define lifecycle and optimistic-concurrency invariants.
- [ ] Define bounded draft/revision creation.
- [ ] Define submit/reopen/approve/publish/withdraw/rollback commands.
- [ ] Define public projection from published content only.
- [ ] Add focused tests before implementation.
- [ ] Export from `@semogtw/domain`.

## Task 2: Persistence

- [ ] Add additive migration `0006_editorial_workflow.sql`.
- [ ] Add document, immutable revision, review and publication-event tables.
- [ ] Keep public projection query independent from private operational tables.
- [ ] Use immediate transactions, idempotency keys and optimistic `updated_at` matching.
- [ ] Preserve publication history and redirect decisions.
- [ ] Update backup/migration expectations through `0006`.

## Task 3: Owner-only editorial UI

- [ ] Add private document list/detail/editor routes.
- [ ] Add revision diff/preview.
- [ ] Add sensitive-review checklist and approval reason.
- [ ] Add publish/withdraw/rollback confirmation flows.
- [ ] Add responsive/keyboard-safe editor controls.
- [ ] Never expose review/draft payloads through public loaders.

## Task 4: Public reads

- [ ] Add public read model backed only by current published revision.
- [ ] Map to explicit public contracts.
- [ ] Return not-found for draft/withdrawn/unknown content.
- [ ] Add canonical/noindex behavior and approved redirects.
- [ ] Add public confidentiality scanner coverage for editorial/private fields.

## Task 5: Verification

- [ ] Domain lifecycle/content-bound tests.
- [ ] SQLite atomicity/idempotency/rollback tests.
- [ ] Migration `0001`–`0006` memory/file execution.
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
