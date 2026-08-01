# MCP static verification — 2026-08-01

## Scope

This report records verification that was actually observed without claiming the dependency-complete workspace gates.

Verified targets:

- `packages/domain/src/read/devos-read-service.ts`;
- `packages/mcp/src/catalog.ts`;
- `packages/mcp/src/output-schemas.ts`;
- `packages/mcp/src/server.ts`;
- Node-native MCP transport-boundary guardrail;
- official MCP SDK v1.29.0 API/source assumptions used by the adapter and tests.

Not verified here:

- actual `@modelcontextprotocol/sdk` installation;
- real installed Zod/MCP generic compatibility;
- workspace path resolution;
- Vitest execution;
- emitted package build;
- SQLite native module integration;
- browser or remote transport behavior.

## Environment

Observed tools:

```text
Node.js v22.16.0
TypeScript 5.8.3
npm 10.9.2
pnpm unavailable in PATH
```

Registry and alternate source-mirror access remained unavailable from the shell:

```text
Could not resolve host: registry.npmjs.org
Could not resolve host: sourceforge.net
Could not resolve host: downloads.sourceforge.net
```

## TypeScript-assisted checks

Three isolated temporary projects were compiled with TypeScript 5.8.3 and the repository's strict baseline:

```text
strict = true
noUncheckedIndexedAccess = true
exactOptionalPropertyTypes = true
noImplicitOverride = true
noFallthroughCasesInSwitch = true
useUnknownInCatchVariables = true
verbatimModuleSyntax = true
isolatedModules = true
moduleResolution = Bundler
noEmit = true
```

### Domain read service

The current `DevOSReadService` implementation was compiled against strict local declarations matching its imported domain contracts:

- `DevOSOverview`;
- `TodayQueue`;
- `OperationalPortfolio`;
- `ProjectHub`;
- `RoadmapFilters`/`RoadmapResult`;
- `StageState` and `RoadmapArea`.

Observed result:

```text
exit code 0
no TypeScript diagnostics
```

This checks syntax, narrowing, readonly compatibility, exact optional properties and internal construction of normalized roadmap filters. It does not replace the package/workspace typecheck.

### MCP server and protocol result flow

The MCP server implementation was compiled against strict ambient declarations for:

- the domain DTO/result interface;
- the reviewed `McpServer.registerTool` and `registerResource` shapes;
- Zod string/enum/array/optional inference;
- tool/resource protocol result shapes.

Observed result:

```text
exit code 0
no TypeScript diagnostics
```

This checks syntax, unions, callback argument inference, error/success return narrowing, `TextEncoder` availability and output-bound flow. The declarations intentionally model only the reviewed surface and cannot prove the exact installed SDK generics.

### MCP catalog and output schemas

A second MCP-focused temporary project compiled the current structural patterns for:

- readonly tuple destructuring of the five tools and four resources;
- exported catalog annotations and response limit;
- Zod object, record, array, enum, nullable and passthrough schemas;
- `ZodTypeAny` acceptance in shared validation helpers;
- raw output-schema shapes passed to `registerTool`;
- input/output schemas used together for project and roadmap tools;
- static resource registration from the catalog.

Observed result:

```text
exit code 0
no TypeScript diagnostics
```

This specifically reduced the risk introduced by replacing `ZodType<unknown>` with the canonical broad `ZodTypeAny` alias and by centralizing catalog metadata. It still cannot substitute for the installed Zod/SDK declarations.

## Official SDK source review

The following v1.29.0 behavior was confirmed from official source:

- `McpServer` exposes `registerTool`, `registerResource`, `connect` and `close`;
- `registerTool` accepts a Zod raw shape or schema for input/output contracts;
- `ReadResourceCallback` receives a `URL` plus request-handler metadata;
- tool output schemas validate `structuredContent` for non-error results;
- output validation is skipped when `result.isError` is true;
- `InMemoryTransport.createLinkedPair()` returns linked client/server transports;
- messages sent before the peer starts are queued and processed during `start()`;
- closing one in-memory transport closes the linked peer.

The queue behavior means the current protocol tests' concurrent client/server connection does not lose initialization messages.

## Output validation and response bounds

The adapter now validates service results before protocol return:

- Overview requires non-negative counters, arrays and nullable timestamp;
- Today requires all five queue/activity arrays;
- portfolio requires active-project, active-repository and repository-catalog arrays;
- project hub requires its project, operational arrays, data source and update timestamp;
- roadmap requires items and all five board columns.

Schemas are passthrough at object boundaries so compatible future fields are preserved. Malformed service data becomes `DEVOS_READ_FAILED` before SDK output validation or resource serialization.

The adapter serializes the validated logical structured object before returning it. When the UTF-8 representation exceeds 256 KiB:

- tools return `isError: true` with `RESULT_TOO_LARGE` and no structured content;
- resources return the stable JSON error envelope;
- oversized source content is not copied into the protocol error.

Official source confirms output-schema validation is skipped for error results, so an oversized or invalid-output tool error is not required to satisfy the success output schema.

## Transport-boundary guardrail

The exact Node-native scanner and fixtures were executed in temporary trees.

Observed accepted cases:

- `McpServer` import;
- `InMemoryTransport` in tests;
- listener-free SQLite composition;
- unrelated non-MCP app namespace.

Observed rejected cases:

- stdio transport;
- Streamable HTTP transport;
- SSE transport class/path patterns;
- Node HTTP listener;
- side-effect Node network import;
- CommonJS network `require`;
- dynamic SDK transport import;
- Express/Hono import;
- future `apps/mcp-*` listener namespace.

Observed output across the suites:

```text
MCP transport boundary guardrail fixtures passed.
MCP transport import variants passed.
Future MCP app namespace boundary passed.
MCP transport boundary passed.
```

The remote PR patch was inspected separately. Forbidden transport identifiers are present in the scanner and negative fixtures, not in production MCP server/composition files.

## Required next verification

In the first dependency-complete environment:

```bash
corepack enable
pnpm install --frozen-lockfile=false
pnpm --filter @semogtw/domain test
pnpm --filter @semogtw/database test
pnpm --filter @semogtw/mcp typecheck
pnpm --filter @semogtw/mcp test
pnpm --filter @semogtw/mcp-app typecheck
pnpm --filter @semogtw/mcp-app test
pnpm check
pnpm build
```

Record the exact resolved MCP SDK version and replace this static evidence only with observed package output. Keep the PR draft after a failure; fix the first real diagnostic rather than modifying APIs from memory.
