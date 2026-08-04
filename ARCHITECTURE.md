# Architecture

## Decision

Semogtw Platform is a pnpm TypeScript monorepo. TanStack Start provides the public site and private DevOS; Hono provides the versioned HTTP surface. Domain rules remain independent from frameworks, storage engines, AI providers and hosting products.

The selected production target is **Cloudflare Workers + D1**. TanStack Start, the public site, private DevOS and the versioned Hono surface will run through a Cloudflare adapter; D1 will be the production relational store. The Node.js 22 + `better-sqlite3` composition remains the portable local-development, test, export and fallback adapter until Cloudflare migrations, authentication, backup and rollback pass their gates.

The complete decision, cost guards, rejected alternatives and cross-project boundary with `Semogtw/goanime-mobile` are owned by [`docs/HOSTING_DECISION.md`](docs/HOSTING_DECISION.md). GPT Sites is no longer a candidate. The Oracle Always Free VM is reserved for the complete Jikan metadata stack and is not the target host for Semogtw Platform.

## Dependency direction

```text
apps/web ─┬─> packages/domain
          ├─> packages/contracts
          ├─> packages/database   (server-only composition/read models)
          ├─> packages/config     (server-only runtime parsing)
          ├─> packages/auth
          └─> packages/ui

apps/api ─┬─> packages/contracts
          └─> packages/auth

apps/mcp ─┬─> packages/database
          └─> packages/mcp

packages/mcp ─> packages/domain + official MCP TypeScript SDK
packages/database ─> packages/domain + packages/auth
packages/config ─> Zod only
packages/domain ─> no framework, ORM or runtime adapter
```

`scripts/check-boundaries.mjs` rejects TanStack, Hono, Drizzle, SQLite, Wrangler, React and application imports inside `packages/domain`. Additional guardrails prevent MCP transport/runtime code from crossing package and browser boundaries.

## Import and runtime protection

Node-specific composition lives in `.server.ts` modules or dedicated runtime applications. TanStack server functions import Node modules only inside server compilation boundaries. `better-sqlite3` is externalized from Vite SSR dependency optimization and its native artifact is verified in CI.

Client-safe modules contain only components, browser helpers, generated `createServerFn` RPC stubs, public contracts and serialized data. SQLite, the MCP SDK, secrets, migrations and server composition must never enter the browser bundle.

The production build verifies that all 13 migrations exist in the SSR bundle and none exist in `dist/client`.

The Cloudflare migration must preserve these boundaries: Workers, Wrangler and D1 bindings belong in runtime adapters and application composition, never in `packages/domain`. The Node bundle remains a supported verification target until D1 reaches contract parity.

## Surfaces

### Public web

Public routes render only approved editorial projections. Dynamic project and note routes never fall back to private operational records. Unknown, draft, withdrawn and unpublished items are not indexed. `robots.txt` excludes `/devos` and `/api/v1/private`, but owner authentication is the actual boundary.

### Semogtw DevOS

Every private route invokes a server-side owner guard before rendering. Every private server function resolves the owner again before opening a read model or performing a mutation. Mutations also validate CSRF, confirmation and bounded input.

Canonical private read services include Overview, Today, Projects, Roadmap, GitHub Operations, cooperative runs, workflow orchestration and editorial administration.

The workflow orchestration surface is split into sibling routes:

```text
/devos/workflows
/devos/workflows/recovery
```

`devos.workflows_.recovery.tsx` deliberately escapes the file-route parent relationship while preserving the URL. This prevents the recovery page from depending on an `<Outlet>` in the dashboard route.

### Workflow orchestration core

The core is provider-neutral and is composed from four bounded units.

#### Scope reservations

Reservations are cooperative soft leases over repository, branch and normalized scope. They are not Git, filesystem or provider locks. Overlap detection is deterministic; expiration is derived at read time, so no scheduler is required. Lifecycle transitions are optimistic, idempotent, audited and transactional. Owner override preserves immutable history.

#### Verification obligations

A verification obligation binds an exact command and required capabilities to a full 40-character commit SHA. `environment_missing`, `timeout`, `quota`, configuration and external dependency are distinct from `code_failure`. Recording a result requires observed evidence and an explicit classification for failed or blocked outcomes.

#### Recovery snapshots

A recovery snapshot is an immutable canonical handoff. The source accepts only the persisted active branch and its latest matching GitHub observation. Missing branch evidence fails closed rather than substituting a default branch or fabricated SHA. Canonical JSON is hashed with SHA-256 and rendered to bounded Markdown. Recent snapshots are exposed only in the private recovery workspace.

#### Safe-work evaluation

`SqliteSafeWorkSource` composes projects, roadmap stages, repository targets, reservations and verification obligations. It considers only the first unfinished stage and requires exactly one active repository. Ambiguous or missing relationships become explicit exclusions.

The initial web read supplies an empty capability set. An owner may re-evaluate with capabilities typed for the current session; those values are normalized, not persisted and never treated as proof that a command ran.

### API

- `/api/v1/public/*`: public serializers only;
- `/api/v1/private/*`: authentication before handlers and private/no-store headers;
- `/health`: infrastructure health without private state.

The Hono application remains an embeddable adapter. The selected first Cloudflare deployment should compose it into the same Worker as the web application unless a measured isolation requirement justifies a separate Worker. Node and other hosted-function bindings remain portability targets.

### MCP read adapter

`packages/mcp` adapts `DevOSReadService` to the reviewed stable v1 MCP SDK. The current catalog contains four static resources and five read-only tools. It has no SQLite, HTTP, cookie, token or transport logic.

`apps/mcp` accepts an already-open migrated database and returns an `McpServer`; it opens no listener. Stdio and Streamable HTTP are not enabled. A remote transport requires a separate reviewed adapter proving authentication, authorization, session isolation, origin/host policy, TLS, rate limits, timeouts, private caching, observability and rollback.

The selected production direction is a separately deployable Cloudflare MCP adapter after the base Site and D1 storage are stable. Future MCP writes must call the same audited domain services used by the DevOS UI. Tool annotations do not authorize mutation.

## Authentication and mutation composition

`AuthProvider` is the authentication boundary. The local adapter validates configuration fail-closed, verifies PBKDF2-SHA256 password hashes, persists only token digests, enforces absolute session expiry/revocation and binds CSRF tokens to server-side sessions.

Private writes use a shared pattern:

1. validate schema;
2. resolve owner and CSRF server-side;
3. open the canonical database;
4. call a domain service with server-generated actor, audit, correlation and idempotency identities;
5. perform entity/event/audit writes in one immediate transaction;
6. reject stale versions and context/entity mismatches before persistence mutation;
7. invalidate the route only after a committed response.

The D1 adapter must preserve the same observable invariants even where transaction APIs, connection lifecycle or runtime bindings differ. Cloudflare identity headers or access policy do not replace application-level authorization unless a later reviewed adapter proves equivalent revocation and owner semantics.

## Storage and migrations

The canonical schema is SQLite-compatible. Drizzle maps tables while raw SQL migrations remain inspectable and additive. The domain never imports Drizzle.

The current migration line is:

```text
0001 foundation
0002 demonstration seed
0003 GitHub observations
0004 GitHub sync runs
0005 cooperative run ledger
0006–0010 editorial workflow and redirects
0011 scope reservations
0012 verification obligations
0013 recovery snapshots
```

Expiration and staleness are derived at read time. No semantic state depends on a cron job. Backups preserve all migrations, private operational rows, append-only events and canonical snapshots.

The demonstration seed is low-confidence private sample data. It is not treated as migrated Notion content, verified GitHub state or real project progress, and the safe-work source excludes it.

Production migration to D1 requires explicit compatibility tests for every migration, repository contract, transaction boundary, backup/export and restore path. The local SQLite database remains a supported adapter; D1 does not redefine domain semantics.

## External observations

GitHub remains read-only. Provider responses are structurally validated and normalized before persistence. Commit messages and other instruction-bearing provider text are not used as commands. Synchronization never changes active branch, project progress, stage state, repository role or target lifecycle automatically.

Silence or absence of commits is evidence of inactivity only, never proof that an AI session completed. Any future inactivity detector must consume persisted observations and present probabilistic language.

## Deployment modes

The selected target is:

- **D — Cloudflare primary:** public web, DevOS, Hono API and D1 on Cloudflare; remote MCP in a separate Cloudflare adapter after the base runtime passes its gates.

The portable alternatives remain documented for rollback and future constraints:

- **A — Unified Node:** web, API, storage and authenticated MCP on one compatible Node host;
- **B — External MCP bridge:** web/API/storage together with a minimal authenticated MCP bridge;
- **C — External backend:** frontend separated from API/storage/MCP.

Mode D is a decision, not a completed deployment. It becomes production-confirmed only after storage, secrets, authentication, routes, transport, versioning, backup, restore, cost limits and rollback are verified in the real Cloudflare runtime.

## Cross-project hosting boundary

SemogSite and GoAnime-Mobile intentionally do not share a primary compute host:

```text
SemogSite → Cloudflare Workers + D1
GoAnime Metadata entry/fallback → Cloudflare Worker
Complete Jikan origin → Oracle Always Free A1
```

SemogSite must not access Jikan databases or volumes. GoAnime-Mobile must not access private DevOS storage. Any future integration uses a bounded authenticated HTTP contract.

## Time

Values are persisted as UTC ISO 8601 strings. Presentation converts to `America/Bahia`. Domain ordering accepts timestamps as data and does not depend on the machine timezone.