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
- provider observations are immutable evidence, not accepted decisions;
- migrated browser mutations use registered command IDs and durable receipts rather than a parallel repository path;
- derived values are recomputed from canonical state and are not stored as arbitrary writable percentages.

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

`roadmap.stages.complete` is registered in the Command Gateway catalog as high-risk and `registered_blocked`. No Gateway runner or receipt is created for it yet. The existing browser path remains legacy until immutable approval storage and stale-safe approved execution exist.

### Attention, sessions and evidence

- `attention_items`: risks, blockers, decisions and external dependencies;
- `development_sessions`: continuity records with branch, tests and next step;
- `evidence`: commit, PR, issue, workflow, test, document or manual note.

Failed, pending or superseded evidence cannot satisfy completion.

Manual attention capture maps domain `critical_test` to persisted `local_test`. External dependencies and critical tests belong to `external_environment`. Resolution and dismissal are optimistic transitions with before/after audit snapshots.

The Today Attention projection includes canonical `updated_at`, exposed as `updatedAt`, so an owner mutation can reject stale state. `attention.transition` is the first browser mutation routed through the Command Gateway. The transaction uses the same pure Attention validation/planning as the legacy service and persists state, audit and successful receipt together.

Manual session handoffs preserve the explicitly reported test status. Commit SHAs are normalized and deduplicated, but commit presence never promotes tests to `passed`.

Manual evidence accepts only canonical kinds/statuses. Optional links must be HTTPS without URL credentials, and the selected status is preserved exactly.

### Growth goals, checkpoints and skills

Migration `0015_learning_goals.sql` creates the private Growth aggregate:

- `learning_goals` and append-only `learning_goal_events`;
- `learning_checkpoints` and append-only `learning_checkpoint_events`;
- `skills` and append-only `skill_alias_events`;
- goal/skill and checkpoint/skill relation tables.

Migration `0015a_learning_checkpoint_weight_modes.sql` adds explicit checkpoint weight provenance:

```text
automatic
custom
```

Goals store lifecycle, priority, target date and optimistic version. They do not store a canonical progress percentage. Progress is derived from measurable checkpoint state and weights; no measurable checkpoint produces an indeterminate result rather than a fabricated zero.

Checkpoints store binary or numeric completion rules, required/optional state, order, integer weight and weight mode. Template quick creation persists deterministic automatic weights totaling 100. Server-derived redistribution accepts identity, expected versions, reason and confirmation, then recomputes weights from the current snapshot; browser-proposed weights are not canonical input.

Skills use canonical identity plus append-only aliases. Desired stages are links, not arbitrary claims of achieved proficiency. Growth routes and read models are owner-scoped and private.

### Command receipts

Migration `0017_command_core.sql` creates `command_receipts`. Migration `0017a_command_receipt_semantic_key.sql` adds the semantic unique index used by the Command Gateway.

A receipt contains:

- opaque receipt ID;
- owner, actor kind/ID and optional client/adapter identity;
- command ID/version and capability;
- canonical resource type/ID;
- SHA-256 request hash;
- `in_progress`, `succeeded` or `failed` status;
- optional SHA-256 result hash and bounded JSON result summary;
- optional stable error code and retryable bit;
- claimed, lease-expiry, completion, creation and update timestamps;
- correlation ID and idempotency key.

It intentionally has no raw request payload, cookie, token, password or secret field.

The semantic uniqueness boundary is:

```text
owner_id
actor_kind
actor_id
client_id
command_id
command_version
idempotency_key
```

Resource ID is excluded. Reusing the same principal/command/key for another target therefore conflicts instead of creating a new execution.

In-progress receipts may extend an expired lease only through explicit recovery with the same request hash. Receipt ID, principal, command, resource, request hash, correlation and idempotency identity are immutable. Final receipts cannot be updated or deleted.

For SQLite-local commands, state mutation, audit insertion and success finalization share one `IMMEDIATE` transaction. A controlled domain failure rolls back state/audit and then finalizes only the stable failure receipt.

### Editability catalog and manifests

The editability catalog is a version-controlled JSON artifact, not a database table. It records command metadata, human labels, feature manifests, private routes and adapter state. It does not contain grants, secrets, payloads or runtime approvals.

Owner entity-action discovery resolves the authenticated owner and exact canonical resource, then projects only human label, risk, reversibility and availability. Missing, unsupported, terminal or denied resources return an empty list.

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

A stale optimistic transition writes no audit row. Audit insertion failure rolls back the entity mutation. A successful Gateway receipt additionally requires an audit row matching its canonical resource and persisted correlation.

### MCP private read projections

The current MCP adapter creates no protocol-session or response-cache table and registers no mutation receipt by itself.

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

MCP annotations are not stored and do not change entity state. No audit event is produced for current read tools because they perform no mutation. The Command Gateway and command receipts do not enable MCP writes; agent authentication/authorization and concrete write-tool rollout remain separate gates.

### Authentication

`owner_accounts` stores only an encoded password hash. `auth_sessions` stores only the digest of a random raw token, with creation, expiry and revocation timestamps.

The browser session model is not implicitly an MCP session model. A future remote transport must define its own authenticated session mapping without adding raw credentials to tool inputs or persisted protocol payloads.

## Demo seed

`0002_seed_demo.sql` contains a single private demonstration project and no repository target. It must never be described as migrated Notion data, live GitHub state or measured production progress.

The seed contains deterministic workstream/stage records for private UI and integration tests. It does not seed a persistent Attention item for Command Gateway E2E; that test creates its own uniquely titled item through the owner UI.

The SQLite-to-MCP integration specification reads the project seed only to prove composition. Its output remains demonstrative and private.

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

A private project or a project without an approved public summary cannot be serialized. Repository targets, identities, observations, recommendations, sync runs, branch decisions, attention, sessions, evidence, stages, Growth state, command receipts, principals, action discovery, audit events and MCP private projections are not part of this projection.
