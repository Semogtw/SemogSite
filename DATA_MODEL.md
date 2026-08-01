# Data Model

## General conventions

- stable text IDs;
- timestamps stored in UTC ISO 8601;
- visibility is explicit: `private`, `unlisted`, or `public`;
- imported/demo origin is explicit in `source`, `data_source` or `updated_from`;
- manual locks and separate decision mutations protect owner choices from synchronization;
- public projections are independent allowlisted DTOs;
- private adapter projections reuse domain DTOs rather than database rows;
- sensitive manual mutations require a reason, confirmation and append-only audit event;
- entity mutation and corresponding audit insertion share one database transaction;
- provider observations are immutable evidence, not accepted decisions.

## Main entities

### Projects and repositories

`projects` stores operational and editorial fields. Public code may read only the approved projection.

`repositories` stores the local DevOS representation of a source repository:

- canonical `owner`, `name`, `full_name` and `github_url`;
- role: `product`, `core`, `integration`, `infrastructure`, `academic` or `experiment`;
- local lifecycle status and `sync_enabled` flag;
- provider default branch and separately accepted `active_branch`;
- provider node ID, last observed time and data source.

Repository names, URLs and branches are private operational data even when the provider repository is public.

A manually registered target starts with:

- `visibility = private`;
- `status = active`;
- `sync_enabled = true`;
- `github_node_id = null`;
- `active_branch = null`;
- `data_source = manual`.

This records configuration, not provider verification. The first successful GitHub read may refresh canonical identity, URL, visibility, default branch, node ID and `last_synced_at`. It does not change role, `sync_enabled`, lifecycle status or `active_branch`.

Pausing or reactivating a target updates only `sync_enabled` and `updated_at`, with optimistic concurrency and an audit event. Historical observations remain intact.

### GitHub observations and recommendations

Migration `0003_github_observations.sql` creates three private evidence tables:

- `github_repository_observations`: immutable provider metadata, API version, ETag, rate-limit state and source hash;
- `github_branch_observations`: normalized branch name, exact head SHA, commit time and protection/default flags;
- `github_branch_recommendations`: unavailable/recommended result, confidence, normalized reason, warnings and evidence.

`html_url` exists in the immutable provider-observation table. The operational `repositories` table uses `github_url`.

Source hashes make identical observations idempotent. A new repository observation, its branch children and its recommendation are inserted atomically. A child conflict rolls back the whole aggregate.

Recommendations are deterministic evidence:

- aliases sharing a head are treated as one development line;
- malformed names, SHAs and timestamps are excluded;
- exact ties prefer the default branch conservatively;
- a stability window prevents oscillation away from a still-current active branch;
- commit messages and other instruction-bearing content are not recommendation inputs.

A recommendation never changes `repositories.active_branch` automatically. The owner may accept the latest immutable recommendation through a separate mutation. That mutation rechecks the latest recommendation ID and expected repository state inside an immediate transaction, updates only `active_branch`/`updated_at`, and inserts `repository.active_branch.accept`. A stale recommendation, concurrent repository update or audit failure leaves the branch unchanged.

When `active_branch` is null, the default branch is treated as the effective active state. Accepting a recommendation equal to that fallback is rejected as a no-op.

### Synchronization runs

The original `sync_runs` table from `0001_foundation.sql` contains generic fields such as `trigger`, `repositories_checked` and `changes_applied`.

Migration `0004_github_sync_runs.sql` extends it additively with:

- `integration`;
- created, updated, skipped and error counters;
- rate-limit remainder and reset time;
- structured `metadata_json`.

Legacy rows are marked `integration = legacy`; `changes_applied` is copied to `created_count` during migration. New GitHub runs populate both generations of fields:

- `trigger = manual` for the current owner-invoked flow;
- `repositories_checked = processedTargets`;
- `changes_applied = createdCount + updatedCount`;
- detailed counters and rate-limit fields for the Operations dashboard.

A run is:

- `success` only when no target is failed or partially observed;
- `partial` when useful evidence is persisted but at least one target/branch is incomplete;
- `failed` when no target produces usable persisted evidence.

Provider errors are contained per repository. A thrown provider error is normalized and does not prevent `finishRun` for the remaining targets.

### Workstreams and stages

Workstreams group larger technical deliveries. Stages contain order, area, state, progress, current position, next step, blocker, evidence summary and manual lock.

Mandatory stage invariants:

1. `completed` requires `progress = 100`;
2. `completed` requires `done = true`;
3. `completed` requires at least one `observed` or `passed` evidence;
4. `blocked` requires blocker text and an unlock action;
5. every non-completed stage requires `nextStep`;
6. `done = true` is invalid outside `completed`;
7. progress must be an integer from 0 to 100.

Manual completion reloads evidence, executes these invariants, sets `manual_lock = true` and inserts `stage.complete` in the same optimistic transaction.

### Attention, sessions and evidence

- `attention_items`: risks, blockers, decisions and external dependencies;
- `development_sessions`: continuity records with branch, tests and next step;
- `evidence`: commit, PR, issue, workflow, test, document or manual note.

Failed, pending or superseded evidence cannot satisfy completion.

Manual attention capture maps domain `critical_test` to persisted `local_test`. External dependencies and critical tests belong to `external_environment`. Resolution and dismissal are optimistic transitions with before/after audit snapshots.

Manual session handoffs preserve the explicitly reported test status. Commit SHAs are normalized and deduplicated, but commit presence never promotes tests to `passed`.

Manual evidence accepts only canonical kinds/statuses. Optional links must be HTTPS without URL credentials, and the selected status is preserved exactly.

### Publications, timeline and media

Publications follow `private_draft → review → scheduled/published`. Publishing requires owner approval. Timeline and media have independent visibility.

### Audit

`audit_events` is append-only and records actor, action, entity, before/after snapshots, reason, confirmation and correlation ID.

Current manual audit actions include:

- `attention.create`;
- `attention.resolve`;
- `attention.dismiss`;
- `development_session.create`;
- `evidence.create`;
- `stage.complete`;
- `repository.sync_target.create`;
- `repository.sync_target.enable`;
- `repository.sync_target.disable`;
- `repository.active_branch.accept`.

A stale optimistic transition writes no audit row. Audit insertion failure rolls back the entity mutation.

### MCP private read projections

The current MCP adapter creates no new table and persists no protocol session or response cache.

`DevOSReadService` projects the canonical private domain DTOs:

- `DevOSOverview`;
- `TodayQueue`;
- `OperationalPortfolio`;
- `ProjectHub`;
- `RoadmapResult`.

The four static resources serialize these projections inside a JSON envelope:

```ts
type McpResourceEnvelope<T> =
  | { ok: true; data: T }
  | { ok: false; error: { code: string } };
```

Successful tools return a keyed structured object plus an equivalent text content item. The keys are `overview`, `today`, `projects`, `project` or `roadmap`.

These are private projections, not public DTOs. They may include repository identities, operational branches, blockers, evidence summaries and internal next actions. A remote transport must authorize the owner before allowing access.

MCP annotations are not stored and do not change entity state. No audit event is produced for current read tools because they perform no mutation. A future security/audit design may record access metadata at the transport layer without persisting complete private response bodies.

### Authentication

`owner_accounts` stores only an encoded password hash. `auth_sessions` stores only the digest of a random raw token, with creation, expiry and revocation timestamps.

The browser session model is not implicitly an MCP session model. A future remote transport must define its own authenticated session mapping without adding raw credentials to tool inputs or persisted protocol payloads.

## Demo seed

`0002_seed_demo.sql` contains a single private demonstration project and no repository target. It must never be described as migrated Notion data, live GitHub state or measured production progress.

The SQLite-to-MCP integration specification reads this seed only to prove composition. Its output remains demonstrative and private.

## Public projection

`toPublicProjectDto` constructs this shape explicitly:

```ts
type PublicProjectDto = {
  slug: string;
  name: string;
  publicSummary: string;
  publicProgress: number | null;
  featured: boolean;
  liveUrl: string | null;
  documentationUrl: string | null;
  lastPublicActivityAt: string | null;
};
```

A private project or a project without an approved public summary cannot be serialized. Repository targets, identities, observations, recommendations, sync runs, branch decisions, attention, sessions, evidence, stages, audit events and MCP private projections are not part of this projection.
