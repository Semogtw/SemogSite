# Data Model

## General conventions

- stable text IDs;
- timestamps stored in UTC ISO 8601;
- visibility is explicit: `private`, `unlisted`, or `public`;
- imported/demo origin is explicit in `source` or `updated_from`;
- manual locks prevent synchronization from overwriting owner decisions;
- public projections are independent DTOs.

## Main entities

### Projects and repositories

`projects` stores operational and editorial fields, but public code may read only the approved projection. `repositories` stores GitHub identity, visibility and synchronization settings; private repository names and URLs are never public DTO fields.

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

These rules live in `packages/domain/src/roadmap/stage.ts`, not in UI or SQL handlers.

### Attention, sessions and evidence

- `attention_items`: risks, blockers, decisions and external dependencies;
- `development_sessions`: continuity records with branch, tests and next step;
- `evidence`: commit, PR, issue, workflow, test, document or manual note.

Failed, pending or superseded evidence cannot satisfy completion.

### Publications, timeline and media

Publications follow `private_draft → review → scheduled/published`. Publishing requires owner approval. Timeline and media have their own visibility and cannot inherit project visibility implicitly.

### Sync and audit

`sync_runs` records conservative reconciliations. `audit_events` is append-only for sensitive mutations and records actor, action, before/after, reason, confirmation and correlation ID.

### Authentication

`owner_accounts` stores only an encoded password hash. `auth_sessions` stores only the digest of a random raw token, with creation, expiry and revocation timestamps.

## Demo seed

`packages/database/src/migrations/0001_seed_demo.sql` contains a single private record used to exercise migrations. It is marked `seed_demo`, has unknown health/confidence and no private repository metadata. It must never be described as live state.

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

A private project or a project without an approved public summary cannot be serialized.
