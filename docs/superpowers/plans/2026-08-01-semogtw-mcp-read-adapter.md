# Semogtw Read-only MCP Adapter Plan

**Goal:** Expose a small, authenticated-ready, read-only MCP catalog over the same domain services used by Semogtw DevOS, without selecting or opening a remote transport yet.

## Product boundary

- MCP is an adapter, not a second business-logic layer.
- The first catalog is read-only. No mutation tool is registered.
- The adapter never receives database handles, tokens or raw HTTP requests.
- A provider-neutral read service composes existing Overview, Today, Projects and Roadmap services.
- Tool and resource failures return stable sanitized codes; internal exception messages are never protocol content.
- Logical JSON responses larger than 256 KiB fail explicitly rather than being truncated or duplicated into an uncontrolled response.
- Private repository names, branches and operational data remain private and require an authenticated transport before remote exposure.
- Stdio, Streamable HTTP, Sites hosting and external MCP bridges remain separate runtime decisions.

## Initial catalog

### Resources

- `semogtw://devos/overview`
- `semogtw://devos/today`
- `semogtw://devos/projects`
- `semogtw://devos/roadmap`

### Tools

- `devos_get_overview`
- `devos_get_today`
- `devos_list_projects`
- `devos_get_project`
- `devos_query_roadmap`

Every tool advertises read-only, non-destructive, idempotent and closed-world annotations.

## Task 1: Provider-neutral read service

- [x] Specify a read-service contract in the domain package.
- [x] Delegate to the existing `OverviewService`, `TodayService`, `ProjectService` and `RoadmapService`.
- [x] Normalize and validate project slugs and roadmap filters.
- [x] Preserve the existing domain DTOs instead of inventing protocol-specific copies.
- [x] Export the service and contracts from `@semogtw/domain`.

## Task 2: MCP SDK adapter

- [x] Add `@semogtw/mcp` using the stable v1.x TypeScript SDK contract.
- [x] Register the four static resources and five read tools.
- [x] Return both human-readable text and `structuredContent` for successful tools.
- [x] Return `isError: true` with stable codes for tool failures.
- [x] Return sanitized JSON error resources rather than leaking thrown messages.
- [x] Reject oversized logical JSON through `RESULT_TOO_LARGE`.
- [x] Keep transport creation outside the package.

## Task 3: Protocol tests

- [x] Specify connection through the official `Client` and `InMemoryTransport`.
- [x] Specify tool/resource discovery and read-only annotations.
- [x] Specify structured results for overview, project list, project hub and roadmap queries.
- [x] Specify not-found and unexpected-failure sanitization.
- [x] Specify that no mutation tool is discoverable.
- [x] Specify the 256 KiB response bound for tools and resources.
- [ ] Execute the protocol suite in an environment that can install `@modelcontextprotocol/sdk`.

## Task 4: SQLite composition

- [x] Compose the read service from canonical SQLite data sources.
- [x] Expose a server factory that accepts an already-open database.
- [x] Keep migration responsibility in the runtime adapter before composition.
- [x] Specify integration behavior against the migrated demo database.
- [x] Avoid opening stdio or HTTP listeners from the composition module.
- [ ] Execute the SQLite-to-MCP protocol integration test.

## Task 5: Documentation and release gates

- [x] Update architecture, security, data model, testing, deployment, runbook, changelog, README and `MCP.md`.
- [x] Add a Node-native guardrail rejecting MCP transport imports and network listeners.
- [x] Execute the guardrail fixture suite and allowed-tree scan.
- [ ] Run package tests, typecheck, workspace check and production build in a dependency-complete environment.
- [x] Keep the PR draft until the protocol suite and workspace gates are observed.
- [ ] Create a separate authenticated Streamable HTTP plan before remote exposure.

## Observed evidence

On 2026-08-01, the exact Node-native transport-boundary guardrail was executed with:

- an allowed `McpServer` + `InMemoryTransport` fixture;
- a forbidden stdio transport fixture;
- a forbidden Streamable HTTP transport fixture;
- a forbidden Node HTTP listener fixture;
- an allowed production-tree scan.

Observed output:

```text
MCP transport boundary guardrail fixtures passed.
MCP transport boundary passed.
```

## Observed constraints

- An explicit installation attempt against `https://registry.npmjs.org` produced no package output before timing out.
- A subsequent DNS probe returned `Could not resolve host: registry.npmjs.org`.
- Official v1.29.0 source and signatures were reviewed through the connected GitHub and Context7 sources.
- The committed SDK-backed tests are executable specifications, not passage evidence, until the package can be installed and the output observed.
