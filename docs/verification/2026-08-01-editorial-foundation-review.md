# Editorial workflow foundation review — 2026-08-01

## Scope implemented

### Domain

- separate working workflow and publication state;
- immutable revision contract;
- bounded title/excerpt/body/tags/hash;
- raw-HTML rejection;
- submit, reopen, approve, publish, withdraw and rollback transitions;
- sensitive review checklist bound to revision/content hash;
- published-only public projection;
- provider-neutral write-service/repository interface.

### Persistence

- migrations `0006`–`0009`;
- document/revision/review/event tables;
- immutable history triggers;
- pointer, persisted-review, sequence, identity, version and timestamp guards;
- atomic SQLite write repository specification/implementation;
- owner-only read model with malformed-history tolerance;
- corrected public read model bound to publication event;
- strict public editorial DTO.

### Security/guardrails

- editorial public confidentiality scanner and fixtures;
- migration/schema/public-read consistency scanner and fixtures;
- standalone editorial guardrail runner;
- threat model and test matrix;
- explicit absence of owner UI/public route/autonomous publication.

## Important design outcomes

- A published revision stays public while a newer working revision remains private.
- Public content never falls back to the working revision.
- Public `updatedAt` comes from publish/rollback history, not private edit activity.
- Approval is valid only for one persisted revision/hash.
- Rollback republishes a prior approved revision through a new event.
- Kind/slug are immutable until a redirect policy is designed.
- Raw HTML is outside the initial content contract.

## Review corrections applied

- added persisted-review requirement at database level;
- added contiguous revision/event sequences;
- added immutable revision/review/event/delete guards;
- added immutable document identity and exact version increment;
- replaced adoption path for a provisional public source that exposed private activity time;
- separated repository revision sequence from aggregate document version;
- added public strict DTO and confidentiality/schema guardrails;
- added owner read model with explicit malformed JSON/tag markers.

## Known blockers

### Package wiring

Editorial modules are not yet safely exported from root domain/database/contracts barrels. Do not introduce cross-package relative imports as a permanent workaround.

### Provisional public source

`published-editorial-source.ts` must not be exported/used. Adopt `published-editorial-read-model.ts`, then remove the provisional file/test after focused gates pass.

### Pure revision sequence API

The repository-authoritative sequence is correct in `EditorialWriteService`, but `createEditorialRevision` still exposes a provisional aggregate-version-derived sequence when called directly.

### Write-service approval lookup

Publish/rollback should not validate a synthetic approval ID. Split persisted-approval lookup from new-approval creation validation.

### Replay idempotency

Exact retries must remain idempotent after later document transitions without rewinding current state. Stable request fingerprints are required before remote writes.

## Verification actually observed

For this editorial foundation, this session observed:

- successful connector-visible commits for each new file;
- static contract/code review across domain, migrations, triggers, repositories, read models and DTOs;
- explicit isolation from web/API/public route wiring;
- no listener, autonomous publisher or remote write surface added.

No dependency-complete current-HEAD editorial test output was observed.

## Verification not observed

- package/root export typecheck;
- focused domain/contracts/database Vitest;
- migrations `0001`–`0009` in memory/file SQLite;
- trigger execution against the actual migration runner;
- backup/restore with public/private revision fixture;
- standalone editorial guardrails on the current tree;
- full `pnpm check` and build;
- owner UI/public route/browser/security renderer gates.

The implementation remains draft/specification until these outputs are recorded.

## Engineering estimates

Estimates are not passage evidence:

- editorial foundation phase implemented: approximately 55–60%;
- editorial phase deployment/publication readiness: approximately 25–30%;
- cooperative run ledger implementation: approximately 97–98%;
- current foundation PR feature implementation: approximately 92%;
- current foundation PR merge readiness: approximately 68–72%;
- broader long-term Semogtw roadmap: approximately 66–68%.

The current PR readiness did not increase as much as feature implementation because substantial new code remains unexecuted.

## Exact next action

1. wire package-root exports and composed editorial schema;
2. remove/deprecate provisional public source;
3. fix approval lookup and revision sequence API;
4. run editorial standalone guardrails;
5. run focused domain/contracts/database typecheck/tests;
6. execute migrations `0001`–`0009` and backup/restore;
7. fix replay idempotency;
8. only then implement owner UI and public rendering adapter;
9. keep PR #1 draft throughout.
