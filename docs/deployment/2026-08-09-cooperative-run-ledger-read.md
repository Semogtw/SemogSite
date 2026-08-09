# Cooperative run ledger read contract — 2026-08-09

The private cooperative-run ledger is readable from both the Cloudflare Worker/D1 runtime and the Node/SQLite runtime through the same API contract. These reads expose DevOS state only; they do not imply that ChatGPT, Codex or another external process is currently executing.

## Recent runs

`GET /api/v1/private/cooperative-runs`

Supported query parameters:

- `limit`: integer 1–100, default 50;
- `projectId`: optional project scope, maximum 200 characters;
- `runningOnly=true|false`: when `true`, the server maps the request to the canonical `running` status; arbitrary status strings are not accepted;
- `beforeUpdatedAt` + `beforeId`: optional keyset cursor. The pair is mandatory together.

Ordering is deterministic:

```sql
ORDER BY updated_at DESC, id DESC
```

The next page uses a bound predicate equivalent to:

```sql
updated_at < cursor.updatedAt
OR (updated_at = cursor.updatedAt AND id < cursor.id)
```

The response includes `nextCursor` when the returned page is full and `null` otherwise. Cursor values and project filters are always SQL parameters, never string interpolation.

## Run detail and event ledger

`GET /api/v1/private/cooperative-runs/:runId`

Supported query parameters:

- `eventLimit`: integer 1–200, default 100;
- `beforeSequence`: optional positive integer event cursor.

Events are ordered by immutable per-run sequence:

```sql
ORDER BY sequence DESC
```

Subsequent event pages use `sequence < beforeSequence`. The response includes `nextEventCursor` when the event page is full and `null` otherwise. This keeps long-running sessions bounded without offset drift.

## Freshness projection

Each returned run includes an additive `freshness` object derived at one server-side `asOf` timestamp:

- `heartbeatAgeSeconds` is clamped at zero if the persisted heartbeat is in the future because of clock skew;
- `heartbeatExpired` becomes true only when heartbeat age is greater than the run's persisted `staleAfterSeconds` threshold;
- invalid persisted heartbeat timestamps fail closed as expired;
- freshness does not mutate or replace the canonical run status.

A completed, failed or cancelled run may legitimately have an old heartbeat. Consumers must therefore treat freshness as an operational observation, not as an implicit state transition.

## Runtime parity

The D1 and SQLite read models implement the same capabilities:

- project/status filtering;
- run keyset pagination;
- detail lookup;
- event keyset pagination;
- deterministic ordering;
- defensive JSON parsing of event snapshots.

The SQLite read model has integration coverage against the real migrated in-memory schema. D1 has structural query tests that verify cursor predicates and bound parameter order.

## Privacy and failure behavior

All routes live under the existing private API envelope and require a valid owner session. Responses use `Cache-Control: no-store, private`. Storage exceptions are mapped to sanitized `STORAGE_UNAVAILABLE` responses; provider-internal error text is not returned to the caller.
