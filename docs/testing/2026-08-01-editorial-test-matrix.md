# Private editorial workflow test matrix

## Evidence policy

The tests and migrations below are committed specifications until observed on the exact branch HEAD. Do not mark the editorial phase passing from code review alone.

## Domain

### Document and revision creation

- normalize IDs, slug, title, excerpt and tags;
- reject empty/oversized fields and invalid SHA-256;
- reject raw HTML;
- create draft/unpublished document and immutable first revision;
- create private working revision without replacing published pointer;
- revision sequence comes from repository, independent from document version;
- invalid actor/timestamp/expected state rejected before persistence.

### Lifecycle

- draft → in_review;
- in_review → draft;
- in_review → approved;
- approved → draft;
- approved exact revision → published;
- published → withdrawn;
- withdrawn/published → rollback to previously approved revision;
- invalid transitions rejected;
- stale `updatedAt` rejected;
- content/revision/document mismatch rejected;
- all review checks required;
- published revision remains public while another working draft exists.

### Public projection

- exact published revision only;
- draft/withdrawn/unknown returns null;
- no workflow/reviewer/event fields;
- content hash and tags preserved;
- public timestamp uses publication/rollback event, not private edit activity.

## Database migrations

Execute migrations `0001`–`0009` in memory and file-backed SQLite.

Verify:

- four editorial tables and indexes;
- initial document/revision/event transaction;
- immutable revisions/reviews/events;
- document deletion forbidden;
- kind/slug/created identity immutable;
- aggregate version increments exactly by one;
- contiguous revision and event sequences;
- update pointers reference revisions in the same document;
- approval/publication require matching persisted review/hash;
- review/event revision requirements;
- old platform data remains readable;
- repeated migration execution is safe.

## SQLite write repository

### Create document

- document/revision/event atomic;
- exact retry returns duplicate;
- changed intent same key conflicts;
- duplicate slug conflicts distinctly;
- event/revision failure rolls back document.

### Create revision

- repository supplies next sequence;
- old published pointer preserved;
- working/approval state updated through CAS;
- exact retry returns duplicate;
- stale snapshot creates no revision/event;
- trigger failure rolls back revision and document.

### Review/transition

- review inserted before guarded approval update;
- exact review hash/revision/document enforced;
- publish/rollback uses persisted review only;
- withdrawal keeps last published revision;
- event insertion failure rolls back review/document;
- duplicate exact event/result recognized;
- changed event/result same key conflicts.

## Owner read model

- bounded document list;
- working and published titles separate;
- revisions ordered newest first;
- reviews and checks visible only privately;
- events ordered append-only;
- malformed tags/before/after JSON marked explicitly;
- unknown document returns null;
- no public serializer reuse.

## Public read model and contracts

- joins exact `published_revision_id`;
- joins latest publish/rollback event for same revision;
- private draft does not change public content/timestamp;
- withdrawn content not found;
- malformed tags/hash/date/raw HTML omitted;
- kind filter and list limit bounded;
- strict DTO rejects extra private fields;
- public confidentiality and editorial schema scanners pass.

## Owner UI and browser gate

The versioned `pnpm test:e2e` gate currently covers:

1. owner creates document/revision;
2. preview is authenticated;
3. submit for review;
4. incomplete checklist cannot approve;
5. complete review and reason approve exact hash;
6. publish exact revision;
7. anonymous route shows only published content;
8. create new draft while old revision remains public;
9. withdraw makes anonymous route not found;
10. rollback restores prior approved revision with a new event;
11. keyboard navigation and 360×800 layout remain usable;
12. private routes redirect anonymously and retain `noindex`.

Deterministic domain/database suites continue to cover stale two-tab snapshots, lost-response exact retries and changed intent under the same idempotency key. Long-content stress and CSP behavior remain host/runtime gates.

## Renderer/security

- markdown parser pinned by lockfile;
- raw HTML disabled;
- script/event-handler/unsafe URI payloads sanitized;
- external links receive approved scheme/rel behavior;
- images/assets only from approved references;
- code blocks and tables bounded/responsive;
- no review notes or private metadata in rendered source;
- CSP behavior verified in selected host.

## Backup/restore

A file-backed fixture must contain:

- published revision A;
- private working revision B;
- review for A;
- publication and draft events;
- unrelated existing DevOS/GitHub/run-ledger records.

After verified backup/restore:

- public adapter returns revision A and publication timestamp;
- owner adapter returns both revisions and history;
- triggers remain installed;
- no migration is missing;
- database integrity passes.

## Canonical first execution

```bash
corepack enable
pnpm install --frozen-lockfile
node scripts/check-editorial-guardrails.mjs
pnpm --filter @semogtw/domain typecheck
pnpm --filter @semogtw/domain test -- editorial
pnpm --filter @semogtw/contracts typecheck
pnpm --filter @semogtw/contracts test -- editorial
pnpm --filter @semogtw/database typecheck
pnpm --filter @semogtw/database test -- editorial
pnpm check
pnpm build
pnpm test:e2e
```

Adapt Vitest filters to the installed CLI when necessary; do not skip the full package suite after focused tests.

## Passage report

Record:

- exact commit SHA;
- Node/pnpm/dependency versions;
- commands and exit codes;
- migration and backup fixture paths/IDs;
- browser routes/viewports;
- public response snapshots without private data;
- failures/fixes/rerun output.

Keep PR draft on any typecheck, migration, public confidentiality, renderer, browser or backup failure.