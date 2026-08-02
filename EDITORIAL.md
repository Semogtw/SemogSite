# Semogtw private editorial workflow

## Current status

Semogtw Platform now contains the **domain and persistence foundation** for a private editorial workflow. It is not yet wired to owner UI or public routes, and nothing has been published.

Implemented foundation:

```text
private editorial document
        ↓
immutable revisions
        ↓
submit for review
        ↓
complete sensitive-data review bound to revision hash
        ↓
approve exact revision
        ↓
publish / withdraw / rollback through append-only events
        ↓
strict public projection from published revision only
```

## Separate working and publication state

A document stores two independent concepts:

```text
workflowStatus    draft | in_review | approved
publicationStatus unpublished | published | withdrawn
```

This allows a published revision to remain public while a newer working revision stays private.

Pointers:

- `workingRevisionId`: current private editing/review revision;
- `approvedRevisionId`: exact approved working revision, or null;
- `publishedRevisionId`: exact public revision, or null;
- `lastPublishedRevisionId`: preserved publication history after withdrawal.

Editing creates a new immutable revision and returns workflow state to `draft`. It never mutates or replaces the currently published revision automatically.

## Document kinds

```text
project | note | experiment | page
```

The initial domain rejects slug changes after creation. Redirect/canonical-history policy must be designed separately before renaming public slugs.

## Revision content

A revision contains:

- title;
- excerpt;
- markdown body;
- bounded normalized tags;
- SHA-256 content hash;
- author and creation timestamp;
- contiguous sequence scoped to the document.

Raw HTML is rejected in the initial contract. Rendering/sanitization remains a separate verified adapter concern.

Revision sequence is independent from aggregate document version. The SQLite repository/migration is authoritative for contiguous sequence. A tracked cleanup will make this explicit in the pure revision-construction API before owner UI consumes it.

## Sensitive review

Approval is valid only for the exact persisted revision and content hash. Every check must be affirmative:

- credentials/secrets;
- personal/private data;
- operational metadata;
- external links;
- legal/licensing attribution;
- factual claims/test results;
- markdown/embed safety.

A review also records reviewer, reason, optional notes and timestamp. Reviews are immutable and cannot be reused for a different hash.

## Lifecycle

```text
draft → in_review → approved
in_review → draft
approved → draft

unpublished → published
published → withdrawn
withdrawn → published     (approved historical revision)
published → published     (rollback to approved historical revision)
```

Rules:

- publication requires a persisted matching review;
- publication uses the exact approved revision;
- withdrawal removes the public pointer while preserving history;
- rollback writes a new event and changes the public pointer; it never rewrites the old publication event;
- document/revision/review/event histories are non-destructive;
- document transitions increment aggregate version and use optimistic concurrency.

## Storage

Additive migrations:

- `0006_editorial_workflow.sql`: documents, revisions, reviews and events;
- `0007_editorial_invariant_triggers.sql`: immutable rows and pointer integrity;
- `0008_editorial_approval_guards.sql`: persisted-review requirement, contiguous sequences and event requirements;
- `0009_editorial_document_identity_guards.sql`: immutable kind/slug/creation identity and version ordering.

Tables:

- `editorial_documents`;
- `editorial_revisions`;
- `editorial_reviews`;
- `editorial_events`.

Initial document/revision/event creation must share one immediate transaction because the document points to its first revision while the revision belongs to the document. Subsequent pointer updates are guarded by triggers that require the referenced revision to exist.

## Domain and database adapters

Implemented modules:

- pure editorial workflow transitions and public projection;
- provider-neutral `EditorialWriteService` and repository interface;
- atomic SQLite editorial write repository;
- owner-only SQLite editorial read model;
- corrected published-only read model;
- strict public editorial DTO;
- schema and confidentiality guardrails.

Package-root export wiring remains a tracked integration step before web/API use.

## Public projection

The corrected public read model joins:

1. `editorial_documents.published_revision_id`;
2. the matching immutable revision;
3. the latest `editorial.published` or `editorial.rolled_back` event for that same revision.

Public `updatedAt` comes from the publication/rollback event, not `editorial_documents.updated_at`. Therefore creating a private draft does not leak private activity time or falsely refresh public metadata.

Allowlisted public fields:

- kind;
- slug;
- title;
- excerpt;
- markdown body;
- tags;
- content hash;
- published revision ID;
- publication/rollback timestamp.

Excluded private data includes workflow status, working/approved pointers, reviewer identity/notes, events, idempotency/correlation, private projects, repositories, branches, blockers, evidence, runs and commands.

## Guardrails

Standalone commands:

```bash
node scripts/check-editorial-guardrails.mjs
node scripts/check-editorial-confidentiality.mjs
node scripts/check-editorial-schema.mjs
```

They verify:

- public surfaces do not import private editorial workflow/storage modules;
- public contracts do not serialize private workflow fields;
- migrations/tables/triggers/schema symbols exist;
- the public read model binds content to `publishedRevisionId`;
- public timestamp derives from publication events;
- the public read model never references `workingRevisionId`.

These guardrails are committed but not yet observed on the current dependency-complete tree.

## Deliberately absent

- owner editor/review UI;
- public editorial routes;
- autonomous or scheduled publication;
- AI publication without owner approval;
- raw HTML/WYSIWYG;
- asset upload/CDN;
- comments or multi-user review;
- Notion migration;
- remote editorial MCP writes;
- deployment/cache invalidation implementation.

## Required before owner UI

- export editorial domain/database/contracts through package roots;
- adopt only the publication-event public read model and remove the provisional source;
- make revision sequence explicit in the pure API;
- run real typecheck and focused tests;
- execute migrations `0001`–`0009` in memory and file-backed SQLite;
- verify backup/restore with published and draft revisions;
- resolve any trigger/Drizzle mismatch.

## Required before public publication

- owner edit/review/approve/publish/withdraw/rollback flows pass;
- markdown rendering/sanitization and link policy pass;
- anonymous draft/review confidentiality passes;
- public cache invalidation/rollback is verified in the selected host;
- keyboard/360 px review passes;
- full workspace check/build passes;
- deployment backup and rollback drill succeeds.

No committed test or migration is described as passing until its output is observed.