# `@semogtw/mcp-app`

Listener-free runtime composition for the Semogtw read-only MCP server.

## Responsibility

This workspace package connects the canonical SQLite read models to the provider-neutral `DevOSReadService`, then injects that service into `@semogtw/mcp`.

```text
SqliteDatabase
  → SqliteOverviewDataSource
  → SqliteTodayDataSource
  → SqliteProjectDataSource
  → SqliteRoadmapDataSource
  → DevOSReadService
  → createSemogtwMcpServer
```

The exported factory accepts an already-open, already-migrated database and returns an unconnected `McpServer`.

## Public API

```ts
import { createSqliteSemogtwMcpServer } from "@semogtw/mcp-app";

const server = createSqliteSemogtwMcpServer(database);
```

The caller owns the database lifecycle and any reviewed transport lifecycle.

## Explicit non-responsibilities

This package must not:

- parse environment variables;
- open or migrate a database implicitly;
- create stdio, Streamable HTTP or SSE transports;
- import Node HTTP/network modules;
- listen on a port;
- authenticate remote callers;
- add tools/resources independently of `@semogtw/mcp`;
- expose mutation tools.

The repository transport guardrail scans this package and every future `apps/mcp-*` namespace.

## Why there is no `dev` command

There is intentionally no local listener. Protocol behavior is exercised using the official MCP client and `InMemoryTransport` in tests.

A future remote adapter belongs in the separately reviewed `apps/mcp-http` phase only after all preconditions in the authenticated Streamable HTTP plan pass.

## Verification

With dependencies installed:

```bash
pnpm --filter @semogtw/mcp-app typecheck
pnpm --filter @semogtw/mcp-app test
```

The integration suite must prove that migrated SQLite state is visible through the official MCP client without bypassing the canonical domain services.
