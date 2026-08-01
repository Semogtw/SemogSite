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

packages/database ─> packages/domain + packages/auth
packages/config ─> Zod only
packages/domain ─> no framework, ORM or runtime adapter
```

The script `scripts/check-boundaries.mjs` rejects TanStack, Hono, Drizzle, SQLite, Wrangler, React and application imports inside `packages/domain`.

## Import protection

Node-specific composition lives in `.server.ts` files. TanStack server functions import those modules only inside server-function compilation boundaries. `better-sqlite3` is excluded from dependency optimization and externalized from the Vite SSR bundle.

Client-safe modules contain only:

- components and browser helpers;
- generated RPC stubs from `createServerFn`;
- public contracts and serialized data.

## Surfaces

### Public web

Routes render only approved public data. Dynamic project and note routes do not use private records as fallback. Unknown/unpublished items are `noindex`. `robots.txt` excludes `/devos` and `/api/v1/private`, but authentication remains the real boundary.

### Semogtw DevOS

Every private route calls a server-side owner guard before rendering. Every server function that reads private data resolves the current owner again before opening a read model.

The first private read models now use the canonical SQLite database:

- Overview through `OverviewService`;
- Today through `TodayService`;
- Projects and project hubs through `ProjectService`;
- Roadmap through `RoadmapService`.

The login route remains intentionally outside the private route guard and performs no operational read.

### API

- `/api/v1/public/*`: public serializers only;
- `/api/v1/private/*`: authentication middleware before route handlers and `no-store` headers;
- `/health`: infrastructure health without private state.

The Hono application is currently an embeddable adapter. Runtime-specific Node, edge or Sites bindings remain separate work.

### Future MCP

The MCP adapter will call the same domain services. It must not contain independent completion, publication, branch-selection or authorization rules.

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

A future ChatGPT, GitHub or OAuth provider replaces the adapter without changing private route/data contracts.

## Storage

The canonical schema is SQLite-compatible. Drizzle maps tables, while raw SQL migrations remain inspectable and portable. Repository/read-model adapters depend on domain ports and service inputs; the domain never imports Drizzle.

The seed is explicitly `seed_demo`. It is private, low-confidence and never presented as migrated Notion data, GitHub state or measured production progress.

## Deployment modes

- **A:** web, API, storage and MCP in one compatible host;
- **B:** web/API/storage together, minimal external MCP bridge;
- **C:** web separated from external API/storage/MCP.

No mode is considered selected until storage, secrets, auth, API routes, MCP transport, deployment/versioning and rollback are verified in the target host.

## Time

Values are persisted as UTC ISO 8601 strings. Presentation converts to `America/Bahia`. Domain ordering accepts timestamps as data but does not depend on the machine timezone.
