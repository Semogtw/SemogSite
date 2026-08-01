# `@semogtw/mcp`

Transport-free read-only MCP protocol adapter for Semogtw DevOS.

## Responsibility

This package owns:

- the canonical MCP server identity and catalog;
- four static private resources;
- five private read tools;
- protocol input schemas;
- structural output schemas;
- stable sanitized error envelopes;
- response-size and sensitive-output policy;
- construction of an unconnected `McpServer`.

This package does **not** own:

- SQLite or another storage adapter;
- browser sessions or CSRF;
- OAuth/bearer verification;
- stdio, HTTP, SSE or another transport;
- network listeners;
- logging, rate limiting or deployment configuration;
- mutation tools.

## Dependency direction

```text
@semogtw/mcp → @semogtw/domain + MCP SDK + Zod
```

It must not import:

- `@semogtw/database`;
- application packages;
- Node HTTP/network modules;
- MCP server transport modules.

The repository guardrail enforces the transport/network subset of this boundary.

## Public API

```ts
import {
  createSemogtwMcpServer,
  SEMOGTW_MCP_ERROR_CODES,
  SEMOGTW_MCP_MAX_JSON_BYTES,
  SEMOGTW_MCP_READ_ANNOTATIONS,
  SEMOGTW_MCP_RESOURCES,
  SEMOGTW_MCP_SERVER_INFO,
  SEMOGTW_MCP_TOOLS,
  type SemogtwMcpReadService,
} from "@semogtw/mcp";
```

`createSemogtwMcpServer(service)` returns an unconnected `McpServer`. The caller is responsible for selecting and connecting a reviewed transport.

## Service boundary

The injected service must provide only these operations:

```ts
type SemogtwMcpReadService = {
  getOverview(): Promise<DevOSOverview>;
  getToday(): Promise<TodayQueue>;
  listProjects(): Promise<OperationalPortfolio>;
  getProject(slug: string): Promise<DevOSReadResult<ProjectHub>>;
  queryRoadmap(
    input: DevOSRoadmapQueryInput,
  ): Promise<DevOSReadResult<RoadmapResult>>;
};
```

Use `DevOSReadService` from `@semogtw/domain` rather than implementing independent validation or business rules.

## Output pipeline

Every success passes through:

```text
service result
  → structural Zod validation
  → iterative sensitive-key inspection
  → JSON serialization
  → 256 KiB logical-size check
  → text + structuredContent / resource envelope
```

Failures return only a stable code from `SEMOGTW_MCP_ERROR_CODES`.

## Adding a read

A new read requires, in the same reviewed change:

1. a domain/application read contract;
2. a catalog manifest entry;
3. bounded protocol input schema;
4. structural output schema;
5. service delegation with no storage/framework logic;
6. protocol discovery and call tests;
7. error, output-bound and confidentiality tests;
8. updates to `MCP.md`, security/testing docs and deployment gates.

Do not add a write through this procedure.

## Future writes

A mutation requires a separate plan and must reuse an existing audited domain service with owner authorization, reason, confirmation, idempotency, optimistic concurrency and atomic audit insertion.

No mutation is permitted before an authenticated remote transport and rollback path are verified.

## Verification

With dependencies installed:

```bash
pnpm --filter @semogtw/mcp typecheck
pnpm --filter @semogtw/mcp test
```

Without dependencies, only the Node-native repository guardrails and documented static/pure-module checks may be claimed.
