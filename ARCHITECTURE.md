# Architecture

## Decision

Semogtw Platform uses a pnpm TypeScript monorepo. The web surface is TanStack Start; the versioned HTTP surface is Hono. Business rules are isolated from both frameworks.

Production hosting is not selected. The current executable baseline is Node with SQLite. Cloudflare D1, PostgreSQL, serverless, edge runtimes and ChatGPT Sites remain adapter decisions rather than domain dependencies.

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

The script `scripts/check-boundaries.mjs` rejects TanStack, Hono, Drizzle, SQLite, Wrangler, React and application imports inside `packages/domain`.

## Import protection

Node-specific composition lives in `.server.ts` files or dedicated runtime application packages. TanStack server functions import Node modules only inside server-function compilation boundaries. `better-sqlite3` is excluded from dependency optimization and externalized from the Vite SSR bundle.

Client-safe modules contain only:

- components and browser helpers;
- generated RPC stubs from `createServerFn`;
- public contracts and serialized data.

The MCP SDK and SQLite composition are server-only and must never enter the browser bundle.

## Surfaces

### Public web

Routes render only approved public data. Dynamic project and note routes do not use private records as fallback. Unknown/unpublished items are `noindex`. `robots.txt` excludes `/devos` and `/api/v1/private`, but authentication remains the real boundary.

### Semogtw DevOS

Every private route calls a server-side owner guard before rendering. Every server function that reads private data resolves the current owner again before opening a read model.

The private read models use the canonical SQLite database:

- Overview through `OverviewService`;
- Today through `TodayService`;
- Projects and project hubs through `ProjectService`;
- Roadmap through `RoadmapService`.

`DevOSReadService` composes those same four services for non-HTTP adapters. It validates project slugs and bounded roadmap filters but does not duplicate the underlying DTOs or ordering rules.

The login route remains intentionally outside the private route guard and performs no operational read.

### API

- `/api/v1/public/*`: public serializers only;
- `/api/v1/private/*`: authentication middleware before route handlers and `no-store` headers;
- `/health`: infrastructure health without private state.

The Hono application is currently an embeddable adapter. Runtime-specific Node, edge or Sites bindings remain separate work.

### MCP read adapter

`packages/mcp` adapts `DevOSReadService` to the stable v1.x MCP TypeScript SDK. Its initial catalog contains four static resources and five tools for overview, Today, project portfolio/project hubs and roadmap queries.

The adapter:

- registers only read tools;
- marks tools read-only, non-destructive, idempotent and closed-world;
- returns structured content plus a textual JSON representation;
- sanitizes expected and unexpected failures into stable codes;
- contains no SQLite, HTTP, cookie, token or transport logic.

`apps/mcp` is the current server-side composition boundary. It accepts an already-open, already-migrated `SqliteDatabase`, creates the canonical read service and returns an `McpServer` instance.

No listener is opened. Stdio and Streamable HTTP are not selected or exposed. A remote MCP endpoint requires a separate adapter proving authentication, authorization, session isolation, origin policy, TLS, rate limits, private cache behavior, observability and host compatibility before any route is enabled.

### Future MCP writes

Any future write tool must call the existing audited domain services. It must not contain independent completion, publication, branch-selection or authorization rules. Read-only annotations do not authorize writes, and no mutation tool exists in the current catalog.

## Authentication

`AuthProvider` is the application boundary. The local implementation:

- parses configuration with a fail-closed Zod schema;
- creates/migrates the SQLite database on first server-side use;
- verifies a PBKDF2-SHA256 encoded password hash;
- generates 32 random bytes per session;
- persists only SHA-256 of the raw token;
- supports 14-day absolute expiry and revocation;
- transactionally revokes sessions when the password hash changes;
- binds CSRF tokens to the server-side session ID;
- uses generic authentication failures and rate limiting;
- refuses active-session logout when CSRF validation fails.

A future ChatGPT, GitHub or OAuth provider replaces the adapter without changing private route/data contracts. The current browser session implementation is not automatically an MCP transport authentication scheme.

## Storage

The canonical schema is SQLite-compatible. Drizzle maps tables, while raw SQL migrations remain inspectable and portable. Repository/read-model adapters depend on domain ports and service inputs; the domain never imports Drizzle.

The seed is explicitly `seed_demo`. It is private, low-confidence and never presented as migrated Notion data, GitHub state or measured production progress.

MCP reads use the same storage snapshot as DevOS. The adapter does not cache or replicate private records independently.

## Deployment modes

- **A:** web, API, storage and authenticated MCP share a compatible host;
- **B:** web/API/storage stay together and a minimal authenticated external MCP bridge calls shared contracts;
- **C:** web is separated from external API/storage/MCP.

No mode is considered selected until storage, secrets, auth, API routes, MCP transport, deployment/versioning and rollback are verified in the target host.

## Time

Values are persisted as UTC ISO 8601 strings. Presentation converts to `America/Bahia`. Domain ordering accepts timestamps as data but does not depend on the machine timezone.
