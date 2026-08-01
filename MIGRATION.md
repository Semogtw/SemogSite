# Migration

## Status

No Notion content has been imported. The SQLite seed is demonstration-only and must not be compared with expected production counts.

Database schema evolution is separate from content migration. The current schema baseline consists of:

1. `0001_foundation.sql`;
2. `0002_seed_demo.sql`;
3. `0003_github_observations.sql`;
4. `0004_github_sync_runs.sql`.

`0004` extends the original `sync_runs` table additively and must be present before GitHub reads are enabled.

## Content source

The product specification describes an existing DevOS snapshot with projects, repositories, workstreams, stages, attention items and sessions. These counts are acceptance expectations, not data already present in the repository.

Obtain one of:

- a structured Notion JSON/CSV export preserving relation identifiers; or
- an authenticated connector snapshot preserving database/page IDs.

HTML-only exports are a last resort. Do not scrape a public rendering of a private workspace.

## Content import order

1. projects;
2. repositories;
3. workstreams;
4. stages;
5. attention items;
6. development sessions;
7. evidence;
8. publications/timeline/media after explicit approval.

Every imported record receives a stable source mapping and `data_source/updated_from = migration`.

## Repository mapping

Imported repositories must use the canonical operational contract:

- `github_url`, not provider-observation `html_url`;
- role: product, core, integration, infrastructure, academic or experiment;
- status: active, paused, historical or experiment;
- `active_branch` remains a local accepted decision;
- `sync_enabled` is explicit;
- provider metadata refresh must not overwrite manual lifecycle or branch decisions.

GitHub observations are not a replacement for imported project/repository relationships. They are later timestamped evidence linked to an existing target.

## Import protocol

1. save source artifact and checksum outside the public bundle;
2. create and verify a pre-import backup containing migrations `0001`–`0004`;
3. parse into a staging representation;
4. validate required fields, enums, dates and relations;
5. display counts, mappings and warnings;
6. reject domain-invariant violations;
7. commit in one transaction;
8. compare expected and actual counts;
9. inspect samples from every active project;
10. revalidate provider-derived technical fields through the read-only GitHub integration;
11. preserve Notion read-only during parity.

## Idempotency and conflicts

Use source system + source ID as import identity. Re-running an unchanged snapshot must not duplicate records.

Conflicts with manually locked fields, accepted active branches, target lifecycle state or newer audited writes become proposals. They must never silently overwrite owner decisions.

## Dates

Persist timestamps in UTC. Retain original source values in migration diagnostics when conversion is ambiguous. Presentation uses `America/Bahia`.

## Privacy

Migration artifacts may contain private repository names, branches and internal notes. Keep them outside public assets, logs and prompts. Errors should identify source IDs without echoing full sensitive bodies.

## Rollback

Content import runs transactionally. If validation fails, restore the verified pre-import backup or roll back the transaction. Do not partially repair production records by hand without audited mutations.

Schema migration failure must not be bypassed by manually inserting a row into `_semogtw_migrations`. Restore the compatible backup and apply a reviewed forward repair.

## Acceptance

Content migration is complete only when:

- counts match the captured snapshot or every discrepancy is explained;
- relations and source identities are intact;
- domain invariants pass;
- active projects are manually sampled;
- technical fields are revalidated without overwriting manual decisions;
- public DTO/confidentiality tests show no private leakage;
- source checksum and migration run are recorded;
- backup and restore work with all four schema migrations.
