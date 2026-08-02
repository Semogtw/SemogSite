# Deployment

## Current status

No production host or deployment mode is selected. No public deployment is authorized from `develop/foundation-bootstrap`.

The in-process MCP read adapter is implemented, but no stdio or remote transport is enabled. It must not be described as a deployed MCP endpoint.

## Capability verification

Before choosing mode A, B or C, verify and record:

- supported Node/edge runtime and framework adapter;
- persistent relational storage and transactional migration procedure;
- server-only secrets, including `SEMOGTW_GITHUB_TOKEN`;
- server routes/functions, cookies and CSRF behavior;
- static assets and file storage;
- stable authenticated remote MCP transport;
- MCP authorization, session isolation, timeouts and rate limits;
- webhook reception;
- scheduled/background execution;
- outbound HTTPS access to GitHub and rate-limit behavior;
- custom domain and canonical URL;
- preview environments;
- version history and rollback;
- logs, metrics and encrypted backups.

A capability is unavailable until demonstrated in the target environment.

## Modes

### A — Unified

Web, API, database, auth and authenticated MCP share a compatible host. Prefer only when every essential capability is verified.

### B — External MCP bridge

Web, API and database stay together. A minimal authenticated external bridge exposes MCP and calls the same application contracts.

### C — External backend

The web frontend calls an external API/storage/MCP deployment. Business rules remain in shared TypeScript packages.

The current `packages/mcp` and `apps/mcp` code is compatible with any mode because it opens no listener and depends only on the provider-neutral read service and an already-open database.

## Database baseline

A deployable database must contain, in order:

1. `0001_foundation.sql`;
2. `0002_seed_demo.sql`;
3. `0003_github_observations.sql`;
4. `0004_github_sync_runs.sql`.

`0004` preserves the original generic run fields and adds detailed integration counters. Code and schema rollback must keep this compatibility. Never mark a migration as applied manually after a partial failure.

MCP creates no separate schema or response cache. Its reads must use the same migrated database and canonical read models as DevOS.

## Pre-deploy gate

```text
[ ] branch and commit identified
[ ] dependency lockfile committed
[ ] domain, GitHub, database, MCP, API and web tests passed
[ ] official MCP in-memory protocol suite passed
[ ] SQLite-to-MCP integration test passed
[ ] pnpm check passed
[ ] pnpm build passed
[ ] migrations 0001–0004 applied twice idempotently to a disposable database
[ ] verified backup created and restore rehearsed
[ ] anonymous confidentiality tests passed
[ ] authenticated Overview/Hoje/Projetos/Roadmap/Operação/Auditoria smoke tests passed
[ ] Operations no-token and no-target states reviewed
[ ] repository registration, pause/reactivation and audit reviewed
[ ] successful and partial/rate-limited GitHub reads reviewed
[ ] branch recommendation acceptance reviewed with no GitHub write
[ ] active branch, role, target status and sync flag preserved during provider refresh
[ ] MCP catalog contains only the approved four resources and five read tools
[ ] no MCP mutation tool is discoverable
[ ] MCP unexpected errors expose only stable sanitized codes
[ ] no MCP transport listener is present in the public web build
[ ] 360 px and desktop reviewed
[ ] keyboard/focus reviewed
[ ] private cache and cookie behavior reviewed on the host
[ ] secrets scanner passed
[ ] public copy approved
[ ] rollback target recorded
[ ] explicit owner approval received
```

The items above allow deployment of the web/API foundation and the internal adapter code. They do not authorize remote MCP exposure.

## Additional gate for remote MCP

Before enabling a Streamable HTTP, stdio bridge or another remote transport:

```text
[ ] dedicated transport plan reviewed
[ ] transport uses the exact SDK version verified by protocol tests
[ ] TLS and canonical URL verified
[ ] Host and Origin policy verified where applicable
[ ] DNS rebinding protections verified where applicable
[ ] owner authentication and revocation verified
[ ] authorization occurs before private read-service invocation
[ ] sessions are isolated across clients/users
[ ] request size, concurrency, timeout and cancellation limits verified
[ ] shared rate limiting verified for multi-instance deployment
[ ] private/no-store cache behavior verified
[ ] logs contain only correlation IDs and sanitized codes
[ ] raw tool/resource payloads are absent from normal logs
[ ] token/session rotation rehearsed
[ ] ChatGPT or target MCP client compatibility observed
[ ] endpoint disable/rollback switch verified
[ ] explicit owner approval for remote exposure received
```

Read-only annotations are not a substitute for any item in this gate.

## Versioning

Before every production deployment:

1. preserve a git commit and annotated version tag;
2. record all applied migrations, dependency lockfile and schema backup;
3. record the exact installed MCP SDK version when MCP packages are included;
4. save anonymous and authenticated preview evidence;
5. update `CHANGELOG.md`;
6. deploy once;
7. perform confidentiality, authentication and Operations smoke tests;
8. run MCP protocol smoke tests only when a transport is intentionally enabled;
9. record the result or roll back.

## GitHub configuration

- configure `SEMOGTW_GITHUB_TOKEN` only in the server secret store;
- use a fine-grained token with Metadata read and Contents read only;
- restrict repository selection;
- verify the browser receives only a boolean configured state;
- verify logs, audit snapshots, MCP payloads and database records contain no token or authorization header;
- removing the token must disable new reads without deleting targets or evidence.

## MCP configuration

The current code has no MCP secret or listener configuration. Do not add an environment variable that silently enables a public endpoint.

A future transport must use explicit fail-closed configuration. Missing or invalid authentication, canonical URL, session or rate-limit configuration must leave the endpoint disabled or deny every request.

Transport credentials must not be supplied as tool arguments or persisted in protocol response bodies.

## Rollback

Rollback must restore a compatible pair of application code and schema. Destructive migrations are forbidden without a tested reverse path or forward-repair plan.

After `0004`, rolling back to code that assumes only the original `sync_runs` columns is schema-compatible, but it will ignore detailed GitHub fields. Rolling back to code that inserts extended fields without preserving legacy required columns is not compatible and must be blocked.

If direct code rollback is unsafe, disable GitHub reads by removing the token and apply a reviewed forward repair. Existing observations and audit evidence remain private.

The current MCP code can be removed or excluded without a data migration because it owns no table. A future transport must have an independent disable switch so rollback does not require deleting domain services or private data.

## Secrets

Secrets are configured in the host, never committed or embedded in browser output. Rotating the session secret invalidates CSRF tokens and requires session revocation. Rotating the password hash also requires session revocation. Rotating the GitHub token requires a controlled read and confidentiality recheck.

Any future MCP credential must have a documented audience, expiry, revocation and rotation procedure before deployment.

## External services

Cloudflare, Vercel, Netlify, Supabase and ChatGPT Sites remain unselected. Connect a deployment integration only after that service is part of the approved architecture and passes the capability matrix.
