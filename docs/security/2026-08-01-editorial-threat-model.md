# Private editorial workflow threat model

## Scope

This threat model covers:

- private documents and immutable revisions;
- sensitive-data reviews;
- approval, publication, withdrawal and rollback;
- owner-only editorial read/write adapters;
- strict published-only public projection.

It does not approve public routes, markdown rendering, asset uploads, scheduling, remote MCP writes or deployment.

## Assets

- private draft/review content;
- unpublished revision history;
- reviewer identity, reasons and notes;
- publication and rollback history;
- public canonical slug/content;
- idempotency/correlation identifiers;
- owner authentication/session state;
- content hashes and attribution/legal review.

Private operational data such as repository names, branches, blockers, evidence, runs and commands must never become implicit editorial content.

## Trust boundaries

```text
owner browser (future UI)
  │ authenticated session + CSRF + explicit confirmation
  ▼
server functions
  │ bounded text/markdown + server-owned identity
  ▼
provider-neutral editorial service
  │ lifecycle, review and exact-revision invariants
  ▼
SQLite repository
  │ immediate transaction + CAS + immutable history
  ▼
private editorial tables
  │ published-only allowlist adapter
  ▼
strict public DTO
```

## Threats and controls

### Draft or review leakage

**Threat:** public routes load working revisions, reviews, events or reviewer notes.

**Controls:**

- public read model joins only `published_revision_id`;
- strict public DTO rejects unknown/private fields;
- confidentiality scanner covers public routes/content/contracts;
- draft/withdrawn/malformed projections return not found or are omitted;
- no fallback from private operational/project tables.

### Private activity timing leakage

**Threat:** public `updatedAt` changes when a private draft is edited.

**Controls:**

- corrected public read model derives timestamp from `editorial.published` or `editorial.rolled_back` event for the exposed revision;
- it never uses document `updated_at` or working revision timestamps.

### Publishing unreviewed or changed content

**Threat:** SQL/application bug publishes a revision that was never reviewed or whose content changed after review.

**Controls:**

- revisions are immutable;
- review stores revision ID and SHA-256 content hash;
- transition service loads exact persisted approval for publish/rollback;
- database trigger requires a review matching document, revision and hash before approval/publication;
- public content comes from exact published revision pointer.

### Approval checklist bypass

**Threat:** incomplete review row is persisted.

**Controls:**

- domain requires all seven checks;
- every review boolean has database `CHECK (... = 1)`;
- reviews are immutable;
- approval reason is required and bounded.

### Raw HTML or script injection

**Threat:** author publishes active HTML/JavaScript.

**Controls:**

- initial domain and public DTO reject HTML-like tags;
- public read model fails closed on raw HTML in persisted content;
- a separately verified markdown renderer/sanitizer is mandatory before public routes;
- no raw HTML/WYSIWYG is in initial scope.

Regex-based raw-HTML rejection is defense-in-depth, not a complete sanitizer.

### Slug takeover or broken canonical links

**Threat:** changing a slug silently replaces another page or breaks external URLs.

**Controls:**

- unique slug index;
- document kind/slug/creation identity immutable by trigger;
- redirect/canonical history requires a separate reviewed design;
- no slug editing in initial workflow.

### Lost update / concurrent owner tabs

**Threat:** stale form overwrites newer revision or lifecycle state.

**Controls:**

- document aggregate version and `updatedAt` optimistic match;
- version increments exactly by one in a database trigger;
- repository checks current snapshot under an immediate transaction;
- zero/mismatched state returns conflict;
- revision/event insertion and pointer update share one transaction.

### Duplicate/replayed publication

**Threat:** lost response causes duplicate revision/review/event or changed intent reuses a key.

**Controls:**

- document-scoped unique idempotency indexes for reviews/events;
- repository compares exact immutable event/result before returning duplicate;
- same key with changed state/content conflicts;
- public pointer/event history remains append-only.

Request-fingerprint behavior must be verified before any remote write surface.

### Partial transaction

**Threat:** revision/review exists without corresponding document/event, or pointer updates without event.

**Controls:**

- initial document/revision/event and subsequent revision/transitions use immediate SQLite transactions;
- exceptions roll back all writes;
- triggers verify relational invariants;
- tests specify rollback after event failure.

### History rewrite or deletion

**Threat:** published/reviewed evidence is edited or deleted.

**Controls:**

- revision/review/event update triggers abort;
- delete triggers abort;
- document deletion is forbidden;
- withdrawal and rollback append new events rather than rewriting old publication events.

### Operational metadata copied into content

**Threat:** editor pastes private branches, blockers, audit records or run data into a public revision.

**Controls:**

- review checklist explicitly covers operational metadata;
- public adapter never automatically reads operational tables;
- no automatic DevOS-to-editorial content generation;
- future UI must warn and offer preview/diff;
- semantic review remains required because structural scanners cannot understand all prose.

### Secret leakage in free text

**Threat:** credentials appear in markdown, excerpt, review notes or links.

**Controls:**

- credentials review is mandatory;
- private storage/logs must be treated as sensitive;
- future automated secret scanning is defense-in-depth only;
- logs must not contain body/review text by default;
- incident runbook must rotate secrets outside the workflow.

### Malformed historical data

**Threat:** corrupted JSON/tags crashes owner/public pages or is silently accepted.

**Controls:**

- owner read model marks malformed tags and event snapshots explicitly;
- public read model omits malformed projections;
- immutable triggers reduce post-write corruption;
- repair requires backup and additive maintenance, not hidden rewriting.

### Denial of service

**Threat:** huge markdown, tags or histories exhaust memory/UI.

**Controls:**

- body 100 KiB; title/excerpt/tags/reasons/notes bounded;
- owner histories bounded to revisions/reviews 100 and events 200;
- public list bounded to 100;
- raw HTML check and JSON parsing occur on bounded content;
- remote request/rate/concurrency limits remain deployment blockers.

## Residual risks

- Markdown sanitization/rendering has not yet been implemented or verified.
- Free-text review cannot guarantee absence of secrets or inaccurate claims.
- Package-root wiring and full typecheck are pending.
- A provisional public source with private activity timestamp exists but is not approved/exported; it must be removed in favor of the publication-event model.
- Revision sequence is repository-authoritative but the pure helper API still exposes a provisional aggregate-version-derived sequence.
- SQLite single-writer/multi-instance behavior remains a deployment decision.

## Public release blockers

- owner workflow and anonymous confidentiality browser gates;
- renderer/XSS/link tests;
- migration `0001`–`0009` and backup/restore execution;
- exact public adapter/DTO wiring;
- selected-host cache invalidation and rollback;
- no high-severity unresolved finding.

No remote or autonomous publication is authorized by this foundation.