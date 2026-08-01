# Architecture

## Decision

Semogtw Platform uses a pnpm TypeScript monorepo. The web surface is TanStack Start; the versioned HTTP surface is Hono. Business rules are isolated from both frameworks.

Production hosting is not selected. The current baseline is a local Node runtime with SQLite. Cloudflare D1, PostgreSQL, serverless, edge runtimes and ChatGPT Sites remain adapter decisions rather than domain dependencies.

## Dependency direction

```text
apps/web ─┬─> packages/domain
          ├─> packages/contracts
          ├─> packages/auth
          └─> packages/ui

apps/api ─┬─> packages/domain
          ├─> packages/contracts
          └─> packages/auth

packages/database ─> packages/domain + packages/auth
packages/domain ─> no framework, ORM or runtime adapter
```

The script `scripts/check-boundaries.mjs` rejects TanStack, Hono, Drizzle, SQLite, Wrangler, React and application imports inside `packages/domain`.

## Surfaces

### Public web

Routes render only approved public data. Dynamic project and note routes do not use private records as fallback. Unknown/unpublished items are `noindex`.

### Semogtw DevOS

Every private route calls a server-side owner guard before its component or future data loader is used. The login route is intentionally outside that guard. Data services must authorize independently even when the UI route is protected.

### API

- `/api/v1/public/*`: public serializers only;
- `/api/v1/private/*`: authentication middleware before route handlers;
- `/health`: infrastructure health without private state.

### Future MCP

The MCP adapter will call the same domain services. It must not contain independent completion, publication, branch-selection or authorization rules.

## Authentication

`AuthProvider` is the application boundary. The local implementation:

- verifies a PBKDF2-SHA256 encoded password hash;
- generates 32 random bytes per session;
- persists only SHA-256 of the raw token;
- supports absolute expiry and revocation;
- binds CSRF tokens to the server-side session ID;
- uses generic authentication failures and rate limiting.

A future ChatGPT, GitHub or OAuth provider replaces the adapter without changing private route contracts.

## Storage

The canonical schema is SQLite-compatible. Drizzle maps tables, while raw SQL migrations remain inspectable and portable. Repositories implement domain ports.

The seed is explicitly `seed_demo`. It is never presented as migrated Notion data, GitHub state or measured progress.

## Deployment modes

- **A:** web, API, storage and MCP in one compatible host;
- **B:** web/API/storage together, minimal external MCP bridge;
- **C:** web separated from external API/storage/MCP.

No mode is considered selected until storage, secrets, auth, API routes, MCP transport, deployment/versioning and rollback are verified in the target host.

## Time

Values are persisted as UTC ISO 8601 strings. Presentation converts to `America/Bahia`. Domain ordering accepts timestamps as data but does not depend on the machine timezone.
