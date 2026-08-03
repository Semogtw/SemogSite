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

Authenticated remote MCP, workflow/recovery reads and Growth reads are specified/planned, but no listener, OAuth endpoint, migration `0014`–`0016`, Growth table or remote client connection has been implemented yet.

## Implemented catalog

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

Stable adapter errors currently include:

- `DEVOS_READ_FAILED`;
- `PROJECT_INVALID_INPUT`;
- `PROJECT_NOT_FOUND`;
- `ROADMAP_INVALID_INPUT`;
- `RESULT_TOO_LARGE`.

Unexpected exception messages, SQL, filesystem paths, tokens and private response bodies are never copied into protocol errors.

The MCP SDK may reject structurally invalid protocol arguments before a tool handler runs. Semantically invalid but structurally valid inputs are normalized and rejected again by provider-neutral services.

## Input bounds

`DevOSReadService` enforces:

- lowercase canonical project slugs, at most 120 characters;
- at most 50 raw project IDs per roadmap request;
- canonical stage states only;
- canonical roadmap areas only;
- deterministic trimming and deduplication;
- no data-source call after invalid input.

Future workflow/Growth tools preserve the same closed-world pattern, collection maximum 50 and existing logical response bound.

## Transport boundary

`scripts/check-mcp-transport-boundary.mjs` scans `packages/mcp` and `apps/mcp` and rejects:

- SDK stdio, Streamable HTTP or SSE server transports;
- Node HTTP/HTTPS/net/TLS imports;
- Express/Hono imports;
- direct network listener calls.

`InMemoryTransport` remains allowed for protocol tests.

The guardrail is part of both `test:guardrails` and `pnpm check`. It must remain deny-by-default. The approved remote implementation may narrow the allowlist only for exact reviewed adapter files under `apps/mcp-http`; `packages/mcp`, `apps/mcp`, web and API remain listener-free.

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

The dependency-complete workflow-core baseline includes the MCP suites in the repository-wide verified gate. Remote/new catalog implementation must nevertheless rerun focused package/app tests, record the exact SDK API and produce fresh HTTP/OAuth/client evidence tied to the implementation head.

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
- independent remote kill switch;
- authenticated stateless Streamable HTTP;
- generic MCP-client verification before Gemini Spark acceptance.

Gemini Spark is an intended compatibility client, not a domain dependency. The owner currently has Spark through Google AI Pro in Brazil, but **Custom apps for Spark** remains a separate account capability that must be observed. Its absence is an external dependency, not a code failure or permission to automate the provider UI.

## Planned workflow/recovery reads

After the original catalog passes its relevant gates, the approved expansion adds exactly:

```text
devos_get_workflow_summary
devos_get_safe_next_work
devos_list_scope_reservations
devos_list_verification_obligations
devos_get_recovery_snapshot
devos_get_project_resume_context
```

This phase adds no resources and no mutation tools.

Required semantics:

- accepted branch and full matching persisted SHA only;
- no completion inferred from commit silence;
- explicit verification classifications preserved;
- safe-work capabilities default to an empty set and are not persisted;
- recovery Markdown is bounded and opt-in;
- collections are bounded/deterministically ordered;
- sensitive-output and 256 KiB limits remain active.

## Planned Growth reads and Spark workflows

Canonical Growth design/overview:

- [`docs/superpowers/specs/2026-08-03-semogtw-learning-growth-evidence-design.md`](docs/superpowers/specs/2026-08-03-semogtw-learning-growth-evidence-design.md)
- [`docs/LEARNING_GROWTH.md`](docs/LEARNING_GROWTH.md)

Executable plans:

- [`docs/superpowers/plans/2026-08-03-semogtw-learning-goals-core.md`](docs/superpowers/plans/2026-08-03-semogtw-learning-goals-core.md)
- [`docs/superpowers/plans/2026-08-03-semogtw-learning-evidence-credentials.md`](docs/superpowers/plans/2026-08-03-semogtw-learning-evidence-credentials.md)
- [`docs/superpowers/plans/2026-08-03-semogtw-learning-mcp-spark-automation.md`](docs/superpowers/plans/2026-08-03-semogtw-learning-mcp-spark-automation.md)

After Growth migrations/services and remote reads pass, add exactly:

```text
devos_list_learning_goals
devos_get_learning_goal
devos_list_due_learning_checkpoints
devos_get_skill_profile
devos_list_learning_evidence
devos_list_credentials
```

Required semantics:

- progress is derived from checkpoint weights and accepted values, never directly set;
- evidence list distinguishes proposed/accepted/rejected/superseded;
- external/model findings do not become canonical progress by themselves;
- skill stages show evidence basis and do not claim universal mastery;
- credentials expose bounded status/summary and not attachment refs, Gmail references, raw IDs or provider payloads by default;
- no Google/Gmail/GitHub credentials pass through the SemogSite MCP;
- Spark may combine providers on its side and produce read-only reports/manual previews before write authorization.

## Deferred supervised Growth writes

Desired future operations are reserved for a separate post-gate design:

```text
devos_create_learning_goal
devos_add_learning_checkpoint
devos_link_goal_repository
devos_propose_learning_evidence
devos_propose_goal_progress
devos_propose_credential
```

These names are not implemented or authorized by the planning documents.

Hard safety direction:

- goal/checkpoint creation may become supervised canonical writes;
- evidence/progress/credential imports create proposals by default;
- no tool directly sets percentage, completes a goal, accepts evidence, verifies a credential or waives a checkpoint;
- every future write needs dedicated OAuth scope, consent, confirmation, expected version, idempotency and atomic audit/events;
- client confirmation is additional UX protection, not server authorization;
- the separate write specification may begin only after remote/Workflow/Growth read gates, canonical browser flows and rollback are verified.

## Remote exposure gate

Do not expose the server over HTTP, stdio or another network transport until the 2026-08-03 remote plan proves:

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
- cancellation/disconnect behavior;
- credential rotation;
- endpoint disablement and rollback;
- generic MCP client compatibility;
- Gemini Spark compatibility when the account exposes custom apps.

Read-only annotations do not satisfy these requirements.

## Future writes

Any future write tool must call the same audited domain service already used by DevOS and preserve:

- explicit confirmation;
- reason where sensitive;
- optimistic concurrency;
- idempotency;
- atomic audit/event insertion;
- owner authorization;
- no direct GitHub write unless separately designed/approved.

No write plan may begin merely by adding a handler to `packages/mcp`. No write scope exists in the approved remote design.
