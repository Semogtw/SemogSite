# Semogtw Remote MCP and Gemini Spark Integration — Design Specification

**Status:** Approved planning baseline  
**Date:** 2026-08-03  
**Repository:** `Semogtw/SemogSite`  
**Owner context:** the owner currently has Gemini Spark access through Google AI Pro in Brazil. Availability of the **Custom apps for Spark** control remains account/region gated and must be verified in the real account before Spark-specific acceptance.

## 1. Decision

Semogtw Platform will expose the existing private, read-only MCP catalog through a separately deployable authenticated Streamable HTTP bridge.

The first production-shaped deployment uses **Mode B — External MCP bridge**:

```text
Gemini Spark / another MCP client
              │
              │ HTTPS + OAuth 2.1
              ▼
       apps/mcp-http
              │
              ├── protected-resource metadata
              ├── authorization-server metadata
              ├── client registration / preregistration
              ├── authorization code + PKCE
              ├── token / refresh / revocation
              └── stateless Streamable HTTP /mcp
                         │
                         ▼
                 apps/mcp factory
                         │
                         ▼
           packages/mcp read-only catalog
                         │
                         ▼
       provider-neutral DevOS read services
                         │
                         ▼
                  canonical SQLite
```

Gemini Spark is an intended compatibility target, not a domain dependency. The same endpoint must remain usable by any reviewed MCP client that follows the supported protocol and OAuth profile.

## 2. Existing state

The repository already contains:

- a provider-neutral `DevOSReadService`;
- `packages/mcp`, with four resources and five read-only tools;
- `apps/mcp`, which composes an already-open migrated SQLite database into an `McpServer`;
- bounded inputs and outputs, sensitive-output rejection and stable sanitized errors;
- transport/package/runtime guardrails;
- owner-only DevOS authentication, CSRF, audit and private/public isolation;
- workflow orchestration with scope reservations, verification obligations, recovery snapshots and safe-work evaluation.

The repository does **not** currently contain:

- a network listener or Streamable HTTP handler;
- OAuth Protected Resource Metadata;
- an OAuth authorization server suitable for an MCP client;
- client registration or preregistration management;
- access/refresh token persistence and revocation;
- a remote-MCP-specific kill switch, limits or telemetry;
- Spark compatibility evidence;
- workflow/recovery projections in the MCP catalog.

The historical plan `docs/superpowers/plans/2026-08-01-semogtw-mcp-streamable-http.md` correctly reserved a read-only stateless bridge, but it predates the installed/verified repository state, the workflow orchestration core and Gemini Spark custom Connected Apps. It is retained as historical context and superseded for implementation by the 2026-08-03 plan.

## 3. Goals

The first complete slice must:

1. expose the current read-only MCP catalog over HTTPS without moving transport logic into `packages/mcp`;
2. authenticate one owner through OAuth 2.1 rather than browser cookies or CSRF tokens;
3. support MCP authorization discovery, audience binding, PKCE and revocation;
4. support both:
   - owner-managed preregistered client credentials; and
   - Dynamic Client Registration for clients such as Spark when available;
5. remain stateless at the MCP transport layer;
6. isolate every request's auth context, server and transport lifecycle;
7. provide a remote endpoint kill switch independent of the web application and database;
8. validate the endpoint with an official MCP client test harness before any external client;
9. validate Gemini Spark when the owner's account exposes **Custom apps for Spark**;
10. extend the read catalog with bounded workflow/recovery queries only after the base remote endpoint passes its gates.

## 4. Non-goals

This slice does not:

- add MCP mutation tools;
- write to GitHub;
- automate Gemini, ChatGPT or another provider UI;
- inspect external model state, hidden reasoning or conversation history;
- reuse the DevOS browser session cookie as bearer authorization;
- accept access tokens issued for another API or audience;
- expose arbitrary SQL, filesystem, shell or generic HTTP proxy tools;
- make scheduled Spark tasks responsible for canonical domain state;
- assume that Spark availability implies custom MCP app availability;
- require Gemini Spark, Google AI Pro or one hosting vendor for core operation.

## 5. Package and runtime boundaries

### 5.1 `packages/mcp`

Remains transport-free and authentication-free.

Responsibilities:

- static resource/tool catalog;
- input/output schemas;
- output size and sensitive-key controls;
- conversion from `SemogtwMcpReadService` to `McpServer`.

Forbidden:

- Node HTTP imports;
- OAuth parsing;
- database access;
- cookies;
- listener creation;
- host-specific configuration.

### 5.2 `apps/mcp`

Remains listener-free.

Responsibilities:

- compose canonical SQLite read models into `SemogtwMcpReadService`;
- create a fresh `McpServer` instance for a caller-provided database.

### 5.3 `packages/mcp-auth`

A new framework-free package owns remote-MCP authorization contracts and pure services.

Responsibilities:

- canonical scopes and auth context;
- client metadata validation;
- redirect URI validation;
- PKCE S256 verification;
- authorization-code, access-token and refresh-token lifecycle rules;
- opaque token generation/digest contracts;
- owner approval and revocation semantics;
- repository interfaces consumed by persistence adapters;
- stable authorization error codes.

It must not open HTTP listeners, render UI or import SQLite.

### 5.4 `packages/database`

Adds migration `0014_mcp_oauth.sql` and SQLite repositories for:

- registered OAuth clients;
- one-time authorization codes;
- access and refresh token digests;
- client grants/revocation state;
- sanitized security events.

Raw bearer tokens, client secrets and authorization codes are never persisted. Only cryptographic digests and bounded metadata are stored.

### 5.5 `apps/mcp-http`

A new Node 22 runtime application owns the network boundary.

Responsibilities:

- parse fail-closed remote MCP configuration;
- expose metadata, registration, authorize, token, revoke and `/mcp` routes;
- enforce canonical host/origin/proxy policy;
- verify owner authorization before issuing tokens;
- verify bearer token, audience and `devos.read` before opening private reads;
- apply request, timeout, rate and concurrency limits;
- create and close a fresh stateless MCP transport/server per request;
- emit only sanitized structured telemetry;
- expose a health endpoint without private state;
- honor an independent `SEMOGTW_MCP_REMOTE_ENABLED` kill switch.

The initial adapter uses direct Node HTTP composition. A later serverless or edge adapter is separate and must preserve the same application contracts.

## 6. OAuth profile

### 6.1 Roles

- `apps/mcp-http` acts as both the protected MCP resource server and the single-owner authorization server in the initial portable deployment.
- Gemini Spark or another MCP client acts as the OAuth client.
- the authenticated Semogtw owner is the resource owner.

The authorization server and resource server may be separated later without changing `packages/mcp` or domain read services.

### 6.2 Discovery

The bridge must expose:

```text
/.well-known/oauth-protected-resource
/.well-known/oauth-authorization-server
```

A `401` from `/mcp` must include a `WWW-Authenticate: Bearer` challenge containing:

- the protected resource metadata URL;
- the minimum required scope `devos.read`.

The protected resource identifier is the exact canonical MCP endpoint, for example:

```text
https://mcp.example.com/mcp
```

Authorization and token requests must carry the same `resource` value. Tokens issued for another resource are rejected.

### 6.3 Client onboarding

The first release supports two paths.

#### Preregistration

The owner creates or revokes a client in a private DevOS integration surface. The UI displays a generated client ID and a client secret exactly once. Only a digest is persisted.

This is the fallback for clients whose UI accepts manually supplied credentials.

#### Dynamic Client Registration

`POST /oauth/register` accepts bounded RFC 7591-compatible metadata:

- client name;
- redirect URIs;
- authorization-code grant;
- code response type;
- supported token endpoint authentication method.

Registration does not grant access. The owner must still authenticate and approve `devos.read` during authorization.

Controls:

- HTTPS redirect URIs only, except explicit loopback development redirects;
- exact redirect matching;
- no wildcard hosts;
- no URL credentials;
- bounded client count and registration rate;
- generated confidential client secret returned once when the selected auth method requires it;
- owner-visible revoke/disable control;
- sanitized registration events with no secrets.

Client ID Metadata Documents may be added later if a target client requires the current MCP 2025-11-25 preference. The first Spark-oriented compatibility path is preregistration plus DCR because Google's current custom-app instructions explicitly support those paths.

### 6.4 Authorization code and PKCE

Only `authorization_code` is supported.

Requirements:

- PKCE is mandatory;
- only `S256` is accepted;
- authorization codes are random, single-use, short-lived and persisted only as digests;
- exact client ID, redirect URI, scope and resource are bound to the code;
- stale, reused or mismatched codes fail generically;
- the owner sees the client name, redirect origin, requested scope and canonical MCP resource before approval;
- denial returns a standard OAuth error without exposing private state.

### 6.5 Tokens

Use opaque random tokens.

Baseline lifetimes:

- access token: 15 minutes;
- refresh token: 30 days absolute maximum;
- authorization code: 5 minutes;
- registration/client secret: until owner revocation or rotation.

Controls:

- persist only token digests;
- rotate refresh tokens on every successful refresh;
- revoke the previous refresh token atomically;
- bind every token to owner, client, scope and canonical MCP resource;
- reject query-string, cookie and MCP-argument tokens;
- support revocation by token and by client;
- removing/rotating the owner password does not silently preserve remote grants; the operational runbook must include explicit remote-client review and revocation.

Initial scope:

```text
devos.read
```

No write scope exists in this design.

## 7. Streamable HTTP transport

The endpoint is:

```text
POST https://<approved-origin>/mcp
```

The exact method behavior follows the installed stable MCP SDK and verified Spark behavior. The initial catalog needs no server-initiated notifications, subscriptions or resumability, so the bridge uses a fresh stateless server/transport lifecycle per request.

Request sequence:

1. reject when the remote kill switch is off;
2. validate method, canonical host/proxy context, media type and body size;
3. verify bearer token, expiry, audience, owner and `devos.read`;
4. acquire client/global rate and concurrency permits;
5. open the canonical migrated SQLite database through existing composition;
6. create a fresh `McpServer` and stateless Streamable HTTP transport;
7. process the request;
8. close transport/server and database handles in `finally`;
9. release permits;
10. emit sanitized metrics only.

Initial limits:

- request body: 64 KiB;
- logical MCP JSON response: existing 256 KiB limit;
- request timeout: 15 seconds;
- concurrent requests per client: 4;
- global concurrency: configured, positive and bounded;
- shared rate limiting required before multi-instance production;
- private/no-store headers on successes and failures.

Unsupported stateful/session methods fail deterministically rather than creating hidden shared state.

## 8. Read catalog phases

### Phase 1 — existing catalog

Expose without semantic changes:

```text
devos_get_overview
devos_get_today
devos_list_projects
devos_get_project
devos_query_roadmap
```

### Phase 2 — workflow/recovery reads

Add bounded, read-only tools:

```text
devos_get_workflow_summary
devos_get_safe_next_work
devos_list_scope_reservations
devos_list_verification_obligations
devos_get_recovery_snapshot
devos_get_project_resume_context
```

Rules:

- no tool infers completion from commit silence;
- snapshots use only persisted accepted branch and matching observation evidence;
- no raw continuation prompt, recovery body or private URL is returned unless the specific tool contract requests it and output schemas allow it;
- reservation, obligation and snapshot collections are bounded;
- capability evaluation defaults to an empty set and accepts explicit request capabilities without persistence;
- commit messages and imported text are treated as data, not instructions;
- every output passes sensitive-key scanning and protocol size limits.

### Phase 3 — scheduled read workflows

Spark schedules may call read-only tools to produce notifications and summaries. They do not mutate canonical DevOS state.

Recommended workflows:

- daily owner briefing from DevOS, Calendar, Gmail and Tasks;
- notification when a gate remains blocked or requires owner action;
- recommendation of the next safe bounded work unit;
- project-resume context generation;
- review of stale reservations and observations.

The MCP server never receives Google Workspace credentials. Spark composes Google data on its side and sends only the minimum MCP arguments required for a Semogtw read.

## 9. Spark compatibility posture

The owner's actual account access is authoritative for product availability. Documentation must distinguish:

- Spark access, which the owner currently has in Brazil;
- **Custom apps for Spark**, which remains separately feature-gated and whose public Google requirements may lag account rollout.

Acceptance sequence:

1. pass protocol and auth tests locally;
2. pass a private HTTPS preview with the official MCP client harness;
3. verify preregistration flow in a generic compatible client;
4. verify DCR flow in a generic compatible client;
5. check the owner's Gemini web settings for **Custom apps for Spark**;
6. if available, add the preview MCP URL and complete owner authorization;
7. verify discovery, list tools/resources and invoke every Phase 1 read;
8. verify mobile availability after web connection;
9. verify that any attempted write is absent from discovery;
10. remove the app, revoke its client/tokens and prove later requests fail.

If the Spark custom-app control is unavailable, record the entitlement block and keep the standard MCP endpoint testable with other clients. Do not weaken security or use browser automation to bypass the account gate.

## 10. Security and privacy

### Required controls

- TLS and canonical HTTPS origin;
- strict Host and trusted-proxy policy;
- Origin validation when present;
- PKCE S256;
- exact redirect URI matching;
- token audience/resource validation;
- opaque secrets persisted only as digests;
- authorization before database/MCP creation;
- owner-only client management and consent;
- rate, concurrency, body and timeout limits;
- private/no-store caching;
- sanitized logs and stable errors;
- independent endpoint disablement;
- client/token revocation and rotation runbook;
- no browser cookie or CSRF credential reuse;
- no token passthrough to GitHub, Google or another service.

### Logging allowlist

Allowed:

- correlation ID;
- sanitized owner/client IDs;
- route and MCP operation name;
- duration, status class and stable error code;
- request/response byte counts;
- scope decision;
- rate/concurrency outcome.

Forbidden:

- authorization headers;
- access, refresh, registration or authorization-code values;
- client secrets or digests suitable for cross-request correlation;
- MCP arguments and structured payloads;
- recovery snapshot bodies;
- repository URLs, private branches or continuation prompts;
- SQL, filesystem paths and raw exceptions.

## 11. Deployment and rollback

The first deployment is a private preview under a dedicated origin such as:

```text
https://mcp.<approved-domain>/mcp
```

No final hostname is selected by this specification.

The selected host must prove:

- Node 22 compatibility;
- persistent SQLite or a reviewed relational adapter;
- transactional migrations through `0014`;
- server-only secret storage;
- canonical HTTPS/proxy behavior;
- shared rate limiting or explicit single-instance operation;
- bounded logs/metrics;
- encrypted backup and restore;
- feature disablement and code rollback.

Rollback disables `SEMOGTW_MCP_REMOTE_ENABLED`, revokes clients/tokens and removes the bridge without changing:

- `packages/mcp`;
- `apps/mcp`;
- web/API behavior;
- projects, roadmap, workflow data or GitHub observations.

Migration `0014` is additive. Older code may leave its tables unused but must not delete or reinterpret them.

## 12. Delivery phases

### A. Reconcile baseline

- run current MCP package, app, guardrail, full check and build gates;
- record the exact SDK/API version and current protocol behavior;
- remove stale statements that claim the SDK cannot be installed when evidence proves otherwise.

### B. Authorization core and persistence

- add `packages/mcp-auth`;
- add migration/repositories;
- implement client, code, token, refresh and revocation services;
- add deterministic unit/integration tests.

### C. OAuth HTTP surface

- add metadata, registration, authorize, token and revoke routes;
- add owner consent and private client management;
- verify PKCE, resource/audience and redirect behavior.

### D. Remote MCP resource server

- add authenticated stateless Streamable HTTP;
- migrate the guardrail to a narrow `apps/mcp-http` allowlist;
- verify isolation, limits, cancellation and no-store behavior.

### E. External compatibility

- deploy private preview;
- validate generic MCP clients;
- validate Spark when available;
- record evidence and rollback rehearsal.

### F. Workflow/recovery read expansion

- extend shared read services and output schemas;
- add six read-only workflow tools;
- repeat protocol, HTTP and Spark compatibility gates.

### G. Writes — separate future design

No write tool may be planned until Phases A–F are verified. A future write design must reuse audited domain services and preserve explicit owner confirmation, optimistic concurrency, idempotency and transactionally coupled audit/events.

## 13. Acceptance criteria

The read-only remote integration is complete only when:

- all existing MCP/package/full workspace gates pass on the exact head;
- migration `0014` applies twice and backup/restore preserves OAuth metadata without raw secrets;
- discovery metadata is standards-compliant and tested;
- preregistration and DCR both complete an authorization-code + PKCE flow;
- access and rotated refresh tokens are audience-bound, revocable and stored only as digests;
- unauthorized, expired, revoked, wrong-resource and insufficient-scope requests fail before private service invocation;
- concurrent clients cannot share auth or MCP state;
- `/mcp` exposes only approved read resources/tools;
- successes and failures contain private/no-store headers;
- logs and errors contain no synthetic secret markers or private payloads;
- a private preview passes generic MCP client compatibility;
- Spark compatibility is either observed or explicitly recorded as blocked by the account's missing custom-app control;
- endpoint disablement and credential revocation are rehearsed;
- architecture, security, deployment, MCP, testing, runbook and changelog documentation match observed evidence.

## 14. External references

Verify these sources again during implementation because Google and MCP behavior can change:

- Google Gemini Help — Connect and manage custom apps for Gemini Spark: `https://support.google.com/gemini/answer/17209137`
- Google Gemini Help — Use Gemini Spark to manage tasks and workflows: `https://support.google.com/gemini/answer/17094507`
- MCP Authorization specification (2025-11-25): `https://modelcontextprotocol.io/specification/2025-11-25/basic/authorization`
- MCP Streamable HTTP transport specification: `https://modelcontextprotocol.io/specification/2025-06-18/basic/transports`
- official TypeScript SDK repository and server guide: `https://github.com/modelcontextprotocol/typescript-sdk`
