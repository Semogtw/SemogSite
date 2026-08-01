# Migration

## Status

No Notion data has been imported. The SQLite seed is demonstration-only and must not be compared with the expected production counts.

## Source

The source specification describes an existing DevOS snapshot with projects, repositories, workstreams, stages, attention items and sessions. These counts are acceptance expectations, not data already present in this repository.

## Required input

Obtain one of:

- structured Notion export in JSON/CSV with relation identifiers; or
- an authenticated connector snapshot that preserves database and page IDs.

HTML-only exports are a last resort because relation reconstruction becomes unreliable. Do not scrape the public rendering of a private workspace.

## Import order

1. projects;
2. repositories;
3. workstreams;
4. stages;
5. attention items;
6. development sessions;
7. evidence;
8. publications/timeline/media when explicitly approved.

Every imported record receives a stable mapping and `updated_from/source = migration`.

## Import protocol

1. save the source artifact and checksum outside the public bundle;
2. parse into a staging representation;
3. validate required fields, enums, dates and relations;
4. display an import preview with counts and warnings;
5. reject records that violate domain invariants;
6. commit in a transaction;
7. compare expected and actual counts;
8. manually inspect a sample from every active project;
9. revalidate branches, commits, PRs and tests directly against GitHub;
10. preserve Notion read-only during the parity period.

## Idempotency

Use source system + source ID as the import identity. Re-running an unchanged snapshot must not duplicate records. Conflicts with manually locked fields become proposals, never silent overwrites.

## Dates

Parse source dates explicitly. Persist timestamps in UTC and retain the original value/source in migration diagnostics when conversion is ambiguous. Presentation uses `America/Bahia`.

## Privacy

Migration artifacts may contain private repository names, branch information and internal notes. They must remain outside public assets and logs. Import errors should identify source record IDs without echoing full sensitive bodies.

## Rollback

The import runs in a transaction. Before importing into a non-disposable database, create a backup/export and record the schema version. If post-import validation fails, restore the backup or roll back the transaction; do not partially correct production records by hand without audit entries.

## Acceptance

Migration is complete only when:

- counts match the captured snapshot or every discrepancy is explained;
- relations are intact;
- all domain invariants pass;
- four active projects are manually sampled;
- GitHub-derived technical fields are revalidated;
- public DTO tests show no private leakage;
- the source checksum and migration run are recorded.
