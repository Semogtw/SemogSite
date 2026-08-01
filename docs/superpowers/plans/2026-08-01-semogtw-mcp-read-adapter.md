# Semogtw Read-only MCP Adapter Plan

**Goal:** Expose a small, authenticated-ready, read-only MCP catalog over the same domain services used by Semogtw DevOS, without selecting or opening a remote transport yet.

## Product boundary

- MCP is an adapter, not a second business-logic layer.
- The first catalog is read-only. No mutation tool is registered.
- The adapter never receives database handles, tokens or raw HTTP requests.
- A provider-neutral read service composes existing Overview, Today, Projects and Roadmap services.
- Tool and resource failures return stable sanitized codes; internal exception messages are never protocol content.
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

- [ ] Specify a read-service contract in the domain package.
- [ ] Delegate to the existing `OverviewService`, `TodayService`, `ProjectService` and `RoadmapService`.
- [ ] Normalize and validate project slugs and roadmap filters.
- [ ] Preserve the existing domain DTOs instead of inventing protocol-specific copies.
- [ ] Export the service and contracts from `@semogtw/domain`.

## Task 2: MCP SDK adapter

- [ ] Add `@semogtw/mcp` using the stable v1.x TypeScript SDK.
- [ ] Register the four static resources and five read tools.
- [ ] Return both human-readable text and `structuredContent` for successful tools.
- [ ] Return `isError: true` with stable codes for tool failures.
- [ ] Return sanitized JSON error resources rather than leaking thrown messages.
- [ ] Keep transport creation outside the package.

## Task 3: Protocol tests

- [ ] Connect the server and official client through `InMemoryTransport`.
- [ ] Verify tool/resource discovery and read-only annotations.
- [ ] Verify structured results for overview, project list, project hub and roadmap queries.
- [ ] Verify not-found and unexpected failures are sanitized.
- [ ] Verify no mutation tool is discoverable.

## Task 4: SQLite composition

- [ ] Compose the read service from canonical SQLite data sources.
- [ ] Expose a server factory that accepts an already-open database.
- [ ] Ensure migrations run before composition in runtime adapters.
- [ ] Add integration tests against the demo database.
- [ ] Do not open stdio or HTTP listeners from the composition module.

## Task 5: Documentation and release gates

- [ ] Update architecture, security, data model, testing, runbook and changelog.
- [ ] Run package tests, typecheck, workspace check and production build in a dependency-complete environment.
- [ ] Keep the PR draft until the protocol suite and workspace gates are observed.
- [ ] Create a separate authenticated Streamable HTTP plan before remote exposure.
