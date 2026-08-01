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

The guardrail is part of both `test:guardrails` and `pnpm check`. Its Node-native fixture suite and a permitted-tree scan were observed passing on 2026-08-01.

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
- SQLite-to-MCP reads against the demo migration state;
- transport-boundary guardrail fixtures.

The MCP SDK could not be installed in the current shell because `registry.npmjs.org` does not resolve. Therefore the SDK-backed protocol/typecheck suites remain unexecuted. Official v1.29.0 package/source signatures were reviewed through connected official sources for static alignment.

## Remote exposure gate

Do not expose the server over HTTP, stdio or ChatGPT until a separate plan proves:

- owner authentication and revocation;
- authorization before private reads;
- per-session/client isolation;
- TLS and canonical URL;
- Host/Origin and DNS-rebinding policy where applicable;
- request, concurrency and timeout limits;
- shared rate limiting when multi-instance;
- private/no-store caching;
- sanitized structured logs and correlation IDs;
- cancellation and disconnect behavior;
- credential rotation;
- endpoint disablement and rollback;
- compatibility with the intended MCP client and selected host.

Read-only annotations do not satisfy these requirements.

## Future writes

A future write tool must call the same audited domain service already used by DevOS. It must preserve:

- explicit confirmation;
- reason;
- optimistic concurrency;
- idempotency;
- atomic audit insertion;
- owner authorization;
- no direct GitHub write unless separately designed and approved.

No write plan may begin merely by adding a handler to `packages/mcp`.
