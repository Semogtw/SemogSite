# Semogtw Authenticated MCP Streamable HTTP Plan

**Status:** blocked by read-adapter dependency gates. This document authorizes no endpoint and contains no implementation checkpoint marked complete.

**Goal:** Expose the existing read-only Semogtw MCP catalog through an authenticated, owner-only Streamable HTTP adapter without weakening the transport-free domain/protocol packages.

## Preconditions

Implementation must not begin until all are observed:

- `pnpm-lock.yaml` exists and the exact stable MCP SDK v1.x version is recorded;
- `@semogtw/domain`, `@semogtw/database`, `@semogtw/mcp` and `@semogtw/mcp-app` tests pass;
- the official `Client` + `InMemoryTransport` protocol suite passes;
- SQLite-to-MCP composition passes;
- `pnpm check` and `pnpm build` pass;
- private browser auth/cache/confidentiality gates pass;
- a target host and canonical HTTPS origin are selected;
- the owner approves remote exposure explicitly.

## Architectural decision

The first remote adapter is **read-only and stateless**.

Rationale:

- current tools/resources are idempotent reads;
- there are no subscriptions, elicitation, sampling, notifications or server-to-client progress events;
- per-request authentication avoids in-memory session leakage and sticky-instance requirements;
- stateless mode is portable across a single Node process, serverless handlers and multi-instance hosts;
- a future stateful/event-store design remains a separate change when a real feature requires it.

The reviewed SDK v1.x contract supports stateless Streamable HTTP by leaving `sessionIdGenerator` undefined. Exact installed imports and handler APIs must be verified from the resolved lockfile before code is written.

## Dependency direction

```text
apps/mcp-http
  ├─> packages/mcp       protocol catalog/server factory
  ├─> packages/database  canonical SQLite composition
  ├─> packages/auth      only if a reviewed shared verifier contract applies
  └─> host/runtime HTTP adapter

packages/mcp
  └─> no HTTP, auth, cookie, database or listener dependency
```

`packages/mcp` remains transport-free. `apps/mcp` remains the listener-free SQLite factory used by tests and other runtimes.

A future `apps/mcp-http` may be created only after this plan's preconditions pass. The current transport-boundary guardrail intentionally rejects all `apps/mcp-*` network imports; the guardrail may be narrowed only in the same reviewed commit that introduces the approved transport boundary and its tests.

## Authentication and authorization

The endpoint acts as an OAuth 2.0 resource server or uses an equivalently reviewed host verifier.

Required properties:

- Bearer token is accepted only in the `Authorization` header;
- tokens in query strings, cookies, tool arguments or resource URIs are rejected;
- verification occurs before constructing/connecting the private MCP server for the request;
- verifier returns an authenticated owner identity, client ID, scopes and non-null expiry;
- revoked, unknown, expired or wrong-audience tokens return a generic `401` challenge;
- missing `devos.read` scope returns `403 insufficient_scope`;
- Protected Resource Metadata URL is advertised where the selected flow requires it;
- access tokens and complete auth objects are never logged or persisted;
- authorization maps to the single owner account explicitly rather than treating any valid OAuth user as owner;
- browser CSRF tokens are not reused as bearer credentials.

Initial scope:

```text
devos.read
```

No write scope exists in this phase.

## HTTP surface

Proposed canonical endpoint:

```text
POST https://<approved-origin>/mcp
```

The final method set must follow the exact installed Streamable HTTP SDK behavior. In stateless read-only mode, unsupported GET/DELETE/session operations should fail closed with deterministic `405`/protocol responses rather than creating hidden state.

Mandatory response headers:

```text
Cache-Control: no-store, private
Pragma: no-cache
X-Content-Type-Options: nosniff
```

CORS is disabled unless the approved MCP client demonstrably requires a browser origin. If enabled, use an exact allowlist; never `*` with credentials.

## Host and DNS-rebinding protection

- bind only to the host/runtime interface required by deployment;
- validate the canonical `Host` value;
- validate `Origin` when present and applicable;
- never rely on SDK localhost defaults when binding to `0.0.0.0` or a public interface;
- use the SDK host-header middleware or an equivalent reviewed host adapter;
- reject forwarded-host/proto ambiguity unless the trusted proxy chain is explicitly configured;
- verify canonical HTTPS redirects do not receive or forward bearer credentials to another origin.

## Request controls

Initial conservative limits:

- JSON body: 64 KiB maximum;
- logical MCP response representation: existing 256 KiB adapter limit;
- request timeout: 15 seconds;
- maximum concurrent requests per authenticated client: 4;
- maximum global concurrent MCP requests per process: explicit bounded value derived from host capacity;
- rate limit: owner/client key in a shared store for multi-instance deployment;
- malformed JSON and unsupported media types fail before MCP invocation;
- disconnected/aborted HTTP requests propagate cancellation where the SDK/runtime supports it.

Exact production values require load evidence and may be reduced, not silently increased.

## Server lifecycle

For each stateless request:

1. validate method, host/origin, media type and body limit;
2. verify bearer token and `devos.read` scope;
3. acquire rate/concurrency permit;
4. obtain the already-migrated canonical database through the runtime composition;
5. create a fresh MCP server/transport pair or use the exact stateless factory pattern documented by the installed SDK;
6. handle the request;
7. close transport/server in `finally`;
8. release permit;
9. emit only sanitized structured telemetry.

No MCP server instance, auth object or SQLite transaction may leak across callers.

## Error policy

HTTP-layer errors:

- `400`: malformed or unsupported request;
- `401`: missing/invalid/expired/revoked token;
- `403`: valid token without owner authorization or `devos.read`;
- `405`: unsupported method;
- `413`: request body too large;
- `415`: unsupported media type;
- `429`: rate/concurrency limit;
- `500`: sanitized unexpected transport failure;
- `503`: storage/runtime unavailable.

Protocol tool/resource errors remain the stable codes defined in `MCP.md`.

Never include:

- token fragments;
- verifier/authorization-server response bodies;
- SQLite paths or SQL;
- thrown exception messages;
- complete private MCP payloads;
- repository URLs/branches in HTTP error pages.

## Logging and audit

Allowed transport telemetry:

- correlation ID;
- authenticated owner ID in sanitized form;
- client ID in sanitized form;
- scope decision;
- method and route;
- MCP operation/tool/resource name when available;
- duration, response class and stable error code;
- request/response byte counts;
- rate-limit outcome.

Do not log Authorization headers, token hashes suitable for replay correlation, tool arguments, structured content or resource bodies.

Read calls do not create domain `audit_events` in the initial phase. If access auditing becomes a requirement, design a separate metadata-only access log with retention and privacy rules; never reuse mutation audit rows or store response bodies.

## Task 0: Dependency and API verification

- [ ] Install the workspace and commit the lockfile.
- [ ] Record the exact MCP SDK v1.x version.
- [ ] Verify the installed Streamable HTTP class/imports and stateless setup from official source.
- [ ] Verify installed bearer-auth/Protected Resource Metadata helpers or define a provider-neutral verifier boundary.
- [ ] Execute current MCP read protocol and composition suites before touching transport code.

## Task 1: Transport security contracts

- [ ] Define typed runtime configuration for canonical origin, trusted proxy mode, body/time/concurrency/rate limits and auth metadata URLs.
- [ ] Define an owner-only token verifier port with expiry, audience, client and scope output.
- [ ] Specify fail-closed configuration tests.
- [ ] Specify `401`/`403` challenge behavior without secret leakage.

## Task 2: Stateless HTTP adapter

- [ ] Create `apps/mcp-http` only after Task 0 passes.
- [ ] Keep the server factory in `packages/mcp` unchanged.
- [ ] Apply host/origin and body/media validation before auth/MCP invocation.
- [ ] Apply bearer auth and `devos.read` authorization before private reads.
- [ ] Build/close a stateless transport lifecycle in `try/finally`.
- [ ] Add private/no-store response headers.
- [ ] Expose no write tool or generic proxy route.

## Task 3: Guardrail migration

- [ ] Update `check-mcp-transport-boundary.mjs` in the same reviewed commit.
- [ ] Continue rejecting transport/network imports in `packages/mcp` and `apps/mcp`.
- [ ] Allow only the exact approved transport files under `apps/mcp-http`.
- [ ] Reject extra listeners, stdio/SSE transports and unapproved frameworks/paths.
- [ ] Add fixtures proving both the narrow allowlist and bypass rejection.

## Task 4: Tests

- [ ] unauthenticated request is rejected before service invocation;
- [ ] invalid/expired/revoked/wrong-audience token is rejected;
- [ ] missing scope is rejected with `insufficient_scope`;
- [ ] valid owner token can list and call only the read catalog;
- [ ] two clients cannot share state or auth context;
- [ ] body/media/method/host/origin limits fail before MCP invocation;
- [ ] rate and concurrency limits release permits after failure/disconnect;
- [ ] server/transport closes after every request;
- [ ] errors/logs contain no synthetic secret markers;
- [ ] private/no-store headers are present on success and failure;
- [ ] current 256 KiB result bound survives HTTP composition;
- [ ] anonymous public routes still contain no MCP/private data.

## Task 5: Host verification

- [ ] deploy only to a private preview URL;
- [ ] verify TLS, canonical URL and proxy headers;
- [ ] verify selected MCP client discovery/auth/calls;
- [ ] verify timeout/cancellation and cold-start behavior;
- [ ] verify multi-instance rate limiting or explicitly constrain deployment to one instance;
- [ ] inspect logs and caches for private payload leakage;
- [ ] rehearse credential rotation and endpoint disablement;
- [ ] record preview evidence and explicit owner approval.

## Rollback

The remote adapter must have a feature-disable mechanism independent of the database and web application. Disabling/removing `apps/mcp-http` must leave:

- `packages/mcp` read catalog;
- `apps/mcp` in-process composition;
- DevOS web/API;
- canonical SQLite data;
- GitHub observations and audit history

unchanged.

No schema migration is required for the initial stateless transport. If a future stateful event/session store is introduced, it requires its own migration, backup and rollback plan.
