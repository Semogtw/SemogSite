# Test Matrix — Workflow Orchestration Core

## Evidence rule

A committed test is a specification until an execution produces observed output. This matrix separates:

- `implemented`: test/code exists;
- `observed pass`: a current command completed with zero failures;
- `blocked`: the command could not exercise the code because the environment was incomplete;
- `pending`: not yet executed against the current branch head.

## Current observed evidence

Workflow run `30799550302` observed:

| Gate | Result |
|---|---|
| scope-reservation domain tests | observed pass |
| domain package typecheck | observed pass |
| database persistence tests | blocked before execution: native `better-sqlite3` binding absent |
| database package typecheck | skipped after previous failure |

No later code in the branch is called passing until the focused workflow or an equivalent local toolchain run completes.

## Domain matrix

### Scope reservation model

| Case | Expected |
|---|---|
| path normalization | canonical sorted unique patterns |
| traversal or absolute path | rejected |
| unsafe Git branch | rejected |
| same repo/branch overlapping glob | overlap reported |
| another repository or branch | no overlap |
| expired active lease | does not overlap |
| released/overridden lease | does not overlap |
| repository-wide reservation | overlaps every scope on same repo/branch |
| malformed historical patterns | fail conservatively without execution |

### Scope reservation service

| Case | Expected |
|---|---|
| acquire without overlap | active version 1 + audit |
| acquire with overlap unacknowledged | conflict + overlap IDs, no write |
| acknowledged overlap | write + overlap IDs in audit |
| idempotent retry | one entity/event |
| changed reuse | conflict |
| renew current run/version | extended expiry + version increment |
| renew wrong run | rejected |
| release current run/version | released + timestamp |
| owner override | requires reason/confirmation |
| context entity ID mismatch | validation failure before repository call |
| event/audit store failure | entity rollback |

### Verification obligation service

| Case | Expected |
|---|---|
| create exact SHA | pending version 1 |
| abbreviated/nonhex SHA | rejected |
| missing capability/next action | rejected |
| passed with failure classification | rejected |
| failed/blocked without classification | rejected |
| classified failure | deterministic failure signature |
| unsafe evidence URL | rejected |
| stale expected version | no write |
| terminal result mutation | rejected |
| supersede | terminal, auditable |
| waive without confirmation | rejected |
| context entity ID mismatch | validation failure before repository call |

### Recovery renderer/service

| Case | Expected |
|---|---|
| unordered equivalent input | identical canonical JSON |
| exact branch/SHA | preserved |
| invalid timestamp/SHA | rejected |
| future source observation | rejected |
| unsafe document path | rejected |
| credential-shaped text | rejected |
| output over size limit | rejected |
| injected valid SHA-256 hasher | immutable record + audit |
| invalid hash output | no persistence call |
| duplicate store result | explicit duplicate |
| changed idempotent reuse | conflict |

### Safe-work evaluator

| Case | Expected |
|---|---|
| executable candidates | deterministic ranking |
| incomplete dependency | excluded |
| owner decision required | excluded |
| missing runtime capability | excluded with missing capabilities |
| active scope conflict | excluded with reservation IDs |
| expired reservation | ignored |
| unresolved prerequisite gate | excluded |
| stale/invalid source | no ranking invented |

## Database matrix

### Migrations

| Case | Expected |
|---|---|
| fresh database | applies 0001–0013 in order |
| second migrate call | no duplicate application |
| 0011 tables | reservations + events exist |
| 0012 tables | obligations + events exist |
| 0013 table | immutable recovery snapshots exists |
| version zero | rejected |
| invalid SHA | rejected |
| malformed JSON fields | rejected by CHECK |
| foreign keys | enforced |

### Scope reservation repository

- create entity, event and audit atomically;
- list only potential active overlaps;
- deterministic row mapping;
- duplicate stable intent;
- changed reuse conflict;
- compare-and-swap update;
- missing project/repository/run classification;
- no partial row after failed reference/audit/event.

### Verification obligation repository

- exact-SHA persistence;
- JSON capability/evidence round-trip;
- classified result and failure signature;
- sequence increment;
- compare-and-swap;
- duplicate stable result;
- missing project/repository/run/stage classification;
- no partial row on failure.

### Recovery snapshot repository/source

- immutable canonical JSON/Markdown/hash;
- unique canonical hash;
- actor/idempotency duplicate recognition;
- changed reuse conflict;
- missing project/repository/run classification;
- accepted effective branch only;
- latest matching branch observation only;
- no observation means fail closed;
- active reservation/gate composition;
- data-age confidence and warnings;
- neutral commit label rather than provider commit message.

### Read model

- reservation freshness derived at requested timestamp;
- active/expired/inactive counts;
- unresolved and environment-blocked gate counts;
- deterministic operational ordering;
- malformed JSON tolerated as empty bounded collection;
- invalid observation time rejected.

### Backup

Full backup verification must prove:

- migration inventory through `0013`;
- new tables and indexes restored;
- canonical JSON/Markdown/hash preserved byte-for-byte;
- foreign-key integrity and `integrity_check=ok`;
- no partial backup accepted.

Current status: expected migration list in `sqlite-backup.test.ts` still needs reconciliation through `0013` before the full backup test is authoritative.

## Web/server matrix

### Authentication and privacy

- anonymous `/devos/workflows` redirects to login;
- anonymous `/devos/workflows/recovery` redirects to login;
- each server read resolves current owner again;
- each mutation validates CSRF;
- public HTML/API/sitemap contain no repository, branch, SHA, gate or snapshot markers;
- private routes use `noindex, nofollow, noarchive`.

### Forms

- reservation fields bounded and required;
- repository selector uses persisted active targets;
- branch defaults to accepted/effective branch;
- overlap acknowledgement is explicit;
- confirmation required;
- UUID retained across network retry;
- successful mutation invalidates loader data;
- failure does not imply partial success.

### Gate result

- pass sends null classification;
- fail/block requires explicit classification;
- HTTPS evidence parsed one per line/comma;
- terminal obligations hide result form;
- stale version asks for refresh.

### Recovery snapshot

- projectless or unobserved branch returns safe error;
- plan path and section supplied together;
- runtime capability list nonempty;
- private-content confirmation required;
- generated Markdown preview read-only;
- clipboard success feedback;
- denied clipboard preserves selectable textarea;
- snapshot ID/hash/confidence/source age shown.

### Accessibility/responsiveness

At desktop and 360 px:

- no horizontal form overflow;
- touch targets at least 44 px;
- labels associated with fields;
- feedback uses status semantics;
- state is conveyed by text and color;
- keyboard can create, override, record and copy;
- code/branch/SHA values wrap safely.

## Focused command set

```bash
pnpm --filter @semogtw/domain exec vitest run src/orchestration/*.test.ts
pnpm --filter @semogtw/domain typecheck

pnpm --filter @semogtw/database exec vitest run \
  src/orchestration-migrations.test.ts \
  src/repositories/scope-reservation-repository.test.ts \
  src/repositories/verification-obligation-repository.test.ts \
  src/repositories/recovery-snapshot-repository.test.ts \
  src/repositories/recovery-snapshot-source.test.ts \
  src/repositories/workflow-orchestration-read-model.test.ts \
  src/adapters/sqlite-migrations.test.ts
pnpm --filter @semogtw/database typecheck

pnpm --filter @semogtw/ui typecheck
pnpm --filter @semogtw/web typecheck
```

When pnpm lifecycle scripts are blocked, authorize and rebuild only the reviewed native dependency in the isolated validation environment. Do not silently broaden the workspace allowlist.

## Full acceptance gates

Before merge:

```bash
pnpm check
pnpm build
```

Plus focused browser checks for:

- anonymous redirect;
- authenticated workflow dashboard;
- reservation create/override;
- gate create/result;
- recovery snapshot generation/copy fallback;
- no console errors;
- 360 px viewport;
- no private markers in public routes or payloads.

Temporary one-shot executors and validation-only workflow changes must be reviewed and removed or intentionally retained before merge.
