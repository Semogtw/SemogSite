# Semogtw MCP threat model

## Status

Applies to the internal read-only MCP adapter and the planned authenticated Streamable HTTP phase.

Current implementation has no network listener and no remote exposure.

## Assets

Highest-value assets reachable through the read catalog:

- private project summaries and operational status;
- repository identities, URLs, roles and branches;
- blockers, risks and owner/external dependencies;
- stage progress, evidence and recent development sessions;
- synchronization timestamps and operational confidence;
- future transport credentials and authorization metadata;
- server/database availability.

The MCP catalog itself is not sensitive, but every successful projection is private by default.

## Trust boundaries

```text
MCP client
  ↓ future bearer/transport boundary — not implemented
runtime adapter
  ↓ authorization-before-read
@semogtw/mcp
  ↓ input/output validation
DevOSReadService
  ↓ canonical business/query services
SQLite read models
```

Additional code boundaries:

- public web/API must not import MCP packages or SDK code;
- `packages/mcp` must not import storage, auth, UI, application or Node runtime modules;
- `apps/mcp` may compose SQLite but must not open a transport;
- future `apps/mcp-http` remains prohibited until the remote plan gates pass.

## Threats and controls

### T1 — Anonymous or non-owner private reads

**Threat:** A remote endpoint accepts requests before authentication or treats any valid identity as the owner.

**Current control:** No transport/listener exists. Guardrails reject transport imports and web/API MCP shortcuts.

**Required remote controls:** Bearer verification before server composition, explicit owner mapping, `devos.read` scope, audience/expiry/revocation checks, generic `401`/`403` responses.

### T2 — Cross-surface accidental exposure

**Threat:** Web/API imports `@semogtw/mcp` and exposes a hidden route using existing cookies or no authorization.

**Controls:** Node-native cross-surface guardrail rejects MCP package, MCP app, SDK and relative MCP imports from `apps/web` and `apps/api`.

### T3 — Transport smuggling inside the protocol package

**Threat:** A stdio/HTTP/SSE listener is introduced directly in `packages/mcp` or a current/future MCP app without transport review.

**Controls:** Transport/listener scanner covers `packages/mcp`, `apps/mcp` and every `apps/mcp-*` namespace. A separate Node-built-in scanner prevents runtime-specific imports in the protocol package.

### T4 — Business-rule bypass

**Threat:** A tool directly queries SQLite or implements independent project/roadmap validation.

**Controls:** `@semogtw/mcp` accepts only `SemogtwMcpReadService`; canonical `DevOSReadService` delegates existing Overview, Today, Project and Roadmap services. Package boundary scanner rejects database imports.

### T5 — Structurally malformed service result

**Threat:** A read adapter regression returns missing arrays, invalid counters, invalid timestamps or an incomplete board; the SDK forwards it or throws an internal diagnostic.

**Controls:** Projection-specific Zod schemas validate all success data before protocol return. Malformed values become `DEVOS_READ_FAILED`.

### T6 — Credential-bearing field introduced into a DTO

**Threat:** A future projection includes access token, password hash, session ID, cookie, JWT, API key or a generic credentials container.

**Controls:** Iterative key inspection after structural validation rejects credential fields, containers, digests, auth/session identifiers and value-bearing credential names. It returns only `SENSITIVE_OUTPUT_REJECTED`.

**Residual risk:** A credential embedded under a semantically neutral key or free-text field may not be recognized by key inspection. DTO allowlists and upstream read-model review remain required; value-pattern scanning must be designed conservatively to avoid treating legitimate evidence text as credentials.

### T7 — Oversized or pathological object graph

**Threat:** A service returns very large arrays, deep graphs, repeated references or cycles, exhausting CPU/memory before response limits apply.

**Controls:**

- logical JSON size limit: 256 KiB;
- iterative `WeakSet` graph traversal, not recursive traversal;
- circular/repeated-reference handling;
- output collection bound specification: maximum 2,000 records per collection;
- JSON serialization failures become `DEVOS_READ_FAILED`.

**Required confirmation:** Verify the remote branch applies the 2,000-item schema bound before treating this control as implemented.

### T8 — Secret/error leakage

**Threat:** Exceptions expose SQL, file paths, provider response bodies, tokens or complete private output.

**Controls:** Stable error manifest only; thrown messages are discarded; sensitive/oversized/non-JSON values are not copied into protocol errors.

### T9 — Input amplification

**Threat:** A caller sends huge slugs/filter arrays or many invalid IDs to force query work.

**Controls:** Protocol schemas bound lengths/counts before handlers. Domain validation enforces canonical slugs/IDs and does not call read models after invalid input.

### T10 — Mutable operation disguised as read

**Threat:** A tool triggers sync, acceptance, publication, completion or another mutation while retaining read-only annotations.

**Controls:** Canonical catalog contains only five read verbs; catalog test rejects write-like names; no mutation service exists in the package. Future writes require a separate plan, audited domain service and authenticated transport.

### T11 — Cross-client state leakage

**Threat:** A remote stateful server instance shares auth context, queued messages or session data between clients.

**Current control:** No remote transport.

**Planned first transport:** Stateless per-request server/transport lifecycle with auth before construction and close in `finally`.

### T12 — DNS rebinding, host/origin confusion and credential forwarding

**Threat:** A public listener accepts untrusted Host/Origin values or forwards bearer credentials across redirects/proxies.

**Current control:** No listener.

**Required remote controls:** Canonical HTTPS origin, trusted-proxy policy, exact Host/Origin validation, no credential-bearing cross-origin redirects and tested DNS-rebinding protection.

### T13 — Availability and abuse

**Threat:** Slow tools, concurrent requests, large bodies or repeated failures exhaust the runtime/database.

**Required remote controls:** Body limit, timeout/cancellation, per-client/global concurrency, shared rate limit in multi-instance deployments, no-store responses and permit release in `finally`.

### T14 — Dependency/API drift

**Threat:** MCP SDK/Zod behavior differs from reviewed v1.29.0 source or changes after install.

**Controls:** Pin exact resolved version in lockfile, run official-client protocol tests, typecheck against installed declarations and keep the PR draft after any mismatch.

## Abuse cases explicitly excluded from current implementation

- remote HTTP/stdin access;
- OAuth/token verification;
- subscriptions/notifications;
- sampling or elicitation;
- server-to-client progress;
- write tools;
- direct GitHub mutations;
- generic SQL/query tools;
- arbitrary resource URI templates.

Adding any excluded capability requires threat-model review in the same change.

## Security test matrix

Before remote exposure, observe:

- unauthenticated/invalid/expired/revoked/wrong-audience denial before read invocation;
- missing-scope denial;
- owner-only successful discovery/calls;
- no cross-client state/auth leakage;
- Host/Origin/body/media/method rejection before MCP invocation;
- timeout, cancellation, rate and concurrency cleanup;
- stable errors without synthetic secret markers;
- sensitive-field, malformed-output, non-JSON and oversized-result containment;
- private/no-store headers on all response classes;
- no MCP/private markers in anonymous web/API output;
- endpoint disablement and rollback rehearsal.

## Residual risk acceptance

Remote MCP risk is not accepted by this branch. Keeping the adapter internal and listener-free is the current risk treatment.
