# Semogtw MCP

## Current status

Semogtw Platform contains an **in-process, read-only MCP adapter**. It is not a deployed endpoint.

Implemented boundaries:

```text
canonical SQLite read models
        ↓
Overview / Today / Project / Roadmap services
        ↓
DevOSReadService
        ↓
@semogtw/mcp
        ↓
McpServer instance
```

`apps/mcp` composes the chain from an already-open, already-migrated `SqliteDatabase`. It does not open stdio, HTTP, SSE or another listener.

An authenticated remote MCP surface is now specified and planned, but no listener, OAuth endpoint, migration `0014` or remote client connection has been implemented yet.

## Catalog

### Resources

| URI | Projection |
| --- | --- |
| `semogtw://devos/overview` | DevOS overview |
| `semogtw://devos/today` | execution and attention queues |
| `semogtw://devos/projects` | operational project/repository portfolio |
| `semogtw://devos/roadmap` | active roadmap query |

Resources return `application/json` with one of these envelopes:

```ts
type ResourceEnvelope<T> =
  | { ok: true; data: T }
  | { ok: false; error: { code: string } };
```

### Tools

| Tool | Input | Structured key |
| --- | --- | --- |
| `devos_get_overview` | none | `overview` |
| `devos_get_today` | none | `today` |
| `devos_list_projects` | none | `projects` |
| `devos_get_project` | canonical project `slug` | `project` |
| `devos_query_roadmap` | bounded project/state/area filters | `roadmap` |

Every tool advertises:

```json
{
  "readOnlyHint": true,
  "destructiveHint": false,
  "idempotentHint": true,
  "openWorldHint": false
}
```

There is no mutation tool.

## Result policy

Successful tools return:

- one textual JSON content item;
- the same logical value in `structuredContent` under the documented key.

The adapter serializes the logical JSON before returning it. A representation larger than **256 KiB** is rejected instead of truncated or duplicated into a large protocol response.

Stable adapter errors:

- `DEVOS_READ_FAILED`;
- `PROJECT_INVALID_INPUT`;
- `PROJECT_NOT_FOUND`;
- `ROADMAP_INVALID_INPUT`;
- `RESULT_TOO_LARGE`.

Unexpected exception messages, SQL, filesystem paths, tokens and private response bodies are never copied into protocol errors.

The MCP SDK may reject structurally invalid protocol arguments before a tool handler runs. Semantically invalid but structurally valid project/roadmap inputs are normalized and rejected again by `DevOSReadService`.

## Input bounds

`DevOSReadService` enforces:

- lowercase canonical project slugs, at most 120 characters;
- at most 50 raw project IDs per roadmap request;
- canonical stage states only;
- canonical roadmap areas only;
- deterministic trimming and deduplication;
- no data-source call after invalid input.

The protocol schema also bounds string and array sizes before the domain service.

## Transport boundary

`scripts/check-mcp-transport-boundary.mjs` scans `packages/mcp` and `apps/mcp` and rejects:

- SDK stdio, Streamable HTTP or SSE server transports;
- Node HTTP/HTTPS/net/TLS imports;
- Express/Hono imports;
- direct network listener calls.

`InMemoryTransport` remains allowed for protocol tests.

The guardrail is part of both `test:guardrails` and `pnpm check`. It must remain deny-by-default. The approved remote implementation may narrow the allowlist only for the exact reviewed network and Streamable HTTP adapter files under `apps/mcp-http`; `packages/mcp`, `apps/mcp`, web and API remain listener-free.

## Tests

Committed specifications cover:

- provider-neutral read-service delegation and input validation;
- canonical SQLite composition;
- official MCP client/server discovery over `InMemoryTransport`;
- exact resource/tool catalog;
- read-only annotations and absence of mutation tools;
- text plus structured success results;
- project not-found and invalid-input errors;
- unexpected-failure sanitization;
- 256 KiB output bounds;
- SQLite-to-MCP reads against the migrated demo state;
- transport-boundary guardrail fixtures.

The dependency-complete workflow-core baseline includes the MCP suites in the repository-wide verified gate. Remote implementation must nevertheless rerun focused MCP package/app tests, record the exact installed SDK API, and produce fresh HTTP/OAuth/client evidence tied to the implementation head.

## Approved remote MCP design and plans

Canonical design:

- [`docs/superpowers/specs/2026-08-03-semogtw-remote-mcp-spark-design.md`](docs/superpowers/specs/2026-08-03-semogtw-remote-mcp-spark-design.md)

Executable plans:

- [`docs/superpowers/plans/2026-08-03-semogtw-remote-mcp-spark.md`](docs/superpowers/plans/2026-08-03-semogtw-remote-mcp-spark.md)
- [`docs/superpowers/plans/2026-08-03-semogtw-workflow-mcp-read-catalog.md`](docs/superpowers/plans/2026-08-03-semogtw-workflow-mcp-read-catalog.md)

The remote design uses a separately deployable Mode B bridge with:

- framework-free `packages/mcp-auth`;
- additive migration `0014_mcp_oauth.sql`;
- owner-managed preregistration and Dynamic Client Registration;
- authorization code with mandatory PKCE S256;
- audience/resource-bound opaque access and rotating refresh tokens persisted only as digests;
- private owner client management and consent;
- OAuth protected-resource and authorization-server discovery;
- an independent remote kill switch;
- authenticated stateless Streamable HTTP;
- generic MCP-client verification before Gemini Spark acceptance.

Gemini Spark is an intended compatibility client, not a domain dependency. The owner currently has Spark through Google AI Pro in Brazil, but **Custom apps for Spark** remains a separate account capability that must be observed in the real account. Its absence is an external dependency, not a code failure and not permission to bypass the gate with browser automation.

## Planned workflow/recovery reads

After the original catalog passes authenticated remote gates, the approved read-only expansion adds exactly:

```text
devos_get_workflow_summary
devos_get_safe_next_work
devos_list_scope_reservations
devos_list_verification_obligations
devos_get_recovery_snapshot
devos_get_project_resume_context
```

This phase adds no new resources and no mutation tools.

Required semantics:

- accepted branch and full matching persisted SHA only;
- no completion inferred from commit silence;
- explicit verification classifications preserved;
- safe-work capabilities default to an empty set and are not persisted;
- recovery Markdown is bounded and opt-in;
- all collections are bounded and deterministically ordered;
- existing sensitive-output and 256 KiB limits remain active.

## Remote exposure gate

Do not expose the server over HTTP, stdio or another network transport until the 2026-08-03 plan proves:

- additive OAuth persistence and backup/restore;
- owner-only preregistration, DCR, consent and revocation;
- authorization code + PKCE S256;
- exact resource/audience, scope, expiry and refresh rotation;
- authorization before private database/MCP composition;
- per-request client/auth/MCP isolation;
- TLS and canonical URL;
- Host/Origin and trusted-proxy policy;
- request, concurrency and timeout limits;
- shared rate limiting when multi-instance;
- private/no-store caching;
- sanitized structured logs and correlation IDs;
- cancellation and disconnect behavior;
- credential rotation;
- endpoint disablement and rollback;
- generic MCP client compatibility;
- Gemini Spark compatibility when the account exposes custom apps.

Read-only annotations do not satisfy these requirements.

## Future writes

A future write tool must call the same audited domain service already used by DevOS. It must preserve:

- explicit confirmation;
- reason;
- optimistic concurrency;
- idempotency;
- atomic audit/event insertion;
- owner authorization;
- no direct GitHub write unless separately designed and approved.

No write plan may begin merely by adding a handler to `packages/mcp`. No write scope exists in the approved remote design.
