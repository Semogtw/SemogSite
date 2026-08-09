# Deployment

## Current status

Cloudflare Workers + D1 is the selected hosting direction for SemogSite. The project remains provider-neutral at the domain/application-contract level and keeps the Node/SQLite composition as the local/reference adapter and as the fallback for private mutation surfaces that are not yet Worker-safe.

No production deployment is authorized yet. The checked-in Wrangler configuration points only to the development D1 database. Remote preview promotion still requires exact-head gates, D1 export/restore proof, edge-path auth/CSRF verification, observability review and rollback evidence.

The MCP adapter remains in-process/read-only; no stdio or remote transport is enabled.

## Current deployment mode

The implementation is transitioning toward **Mode A (Unified)** on Cloudflare, but it has not reached full parity yet.

Today the safe description is a temporary **split mode**:

- Cloudflare Worker + D1: public project reads, owner login/session/logout, login rate limiting and private read models;
- Node/SQLite: full existing DevOS mutation surface and local development reference path;
- MCP: in-process/read-only only.

Do not claim a fully unified Cloudflare DevOS until the required private writes have Worker-safe adapters and the exact deployment candidate passes the production gates.

## Capability verification

Before promotion, verify and record:

- Worker runtime compatibility and bundle boundary;
- D1 relational behavior and canonical migration procedure;
- server-only secrets for owner auth/session and GitHub reads;
- secure cookies and CSRF through the real edge path;
- login rate limiting through D1 under representative concurrency;
- static assets and canonical web/API URLs;
- outbound HTTPS and GitHub rate-limit behavior;
- preview environment and custom-domain rollback;
- logs/metrics without private payloads or secrets;
- D1 export, restore and schema rollback/forward-repair procedure;
- remote MCP transport separately, only if intentionally enabled later.

A capability is unavailable until demonstrated in the selected environment. Workflow reservation expiration and staleness remain read-time derived and do not require a scheduler.

## Deployment modes

### A — Unified target

Web, API, database, auth and any future authenticated MCP bridge share a compatible Cloudflare architecture. Select as the final state only when every required private write/read path is Worker-safe and verified.

### B — External MCP bridge

Web/API/database remain together; a minimal authenticated bridge exposes MCP and invokes the same application contracts. This remains a future option.

### C — Split backend

Web/Worker reads/auth call or coexist with an external mutation backend. This is acceptable as an explicit transitional state, but routing, auth boundaries and operational ownership must be documented rather than hidden.

## Database baseline

A current `main` database must contain, in order:

1. `0001_foundation.sql`;
2. `0002_seed_demo.sql`;
3. `0003_github_observations.sql`;
4. `0004_github_sync_runs.sql`;
5. `0005_cooperative_run_ledger.sql`;
6. `0006_editorial_workflow.sql`;
7. `0007_editorial_invariant_triggers.sql`;
8. `0008_editorial_approval_guards.sql`;
9. `0009_editorial_document_identity_guards.sql`;
10. `0010_editorial_redirect_registry.sql`;
11. `0011_scope_reservations.sql`;
12. `0012_verification_obligations.sql`;
13. `0013_recovery_snapshots.sql`;
14. `0014_login_rate_limits.sql`.

Migrations are additive. Never mark a partially executed migration as applied. Build/boundary checks must ensure migrations are server-only and that Worker code does not import native SQLite dependencies.

The Growth work preserved in PR #24 contains later migrations (`0015` and `0015a`) but they are not part of the `main` deployment baseline until that branch is reconciled and merged.

Reservations, gates, recovery snapshots, auth digests and rate-limit state are private canonical data and must be covered by the appropriate backup/export policy. MCP owns no separate schema.

## Pre-deploy gate

```text
[ ] exact branch and commit SHA identified
[ ] dependency lockfile committed and frozen install passed
[ ] package/public-confidentiality guardrails passed
[ ] Cloudflare Worker boundary guard passed
[ ] all relevant workspace typechecks passed
[ ] relevant unit/integration suites passed
[ ] pnpm check passed, or an environment limitation is explicitly recorded with focused gates completed
[ ] production web/SSR build passed where applicable
[ ] Wrangler dry-run passed for the exact Worker candidate
[ ] migrations 0001–0014 applied to disposable/local D1 and schema inspected
[ ] D1 export created and restore rehearsed into a separate database
[ ] remote development D1 checkpoint recorded before mutation
[ ] public API smoke tests passed
[ ] owner login/session/logout passed through deployed edge
[ ] secure cookie attributes verified on preview hostname
[ ] CSRF rejection/acceptance behavior verified through deployed edge
[ ] login rate limiting and reset behavior verified
[ ] private Overview/Hoje/Projetos/Roadmap/Auditoria/Workflows reads passed
[ ] anonymous routes expose no private operational markers
[ ] GitHub reads reviewed without provider writes
[ ] reservations/gates/recovery behavior reviewed in the runtime responsible for writes
[ ] MCP catalog contains only approved read resources/tools
[ ] no MCP transport listener or mutation tool is exposed
[ ] desktop and 360 px layouts reviewed
[ ] logs contain no private DTOs, auth material, branch payloads or secrets
[ ] Worker rollback target recorded
[ ] D1 forward-repair/compatible-code rollback plan recorded
[ ] explicit owner approval received
```

Old test counts and old workflow run IDs are historical evidence only. Any code or migration change requires evidence tied to the exact candidate SHA.

## Toolchain and CI policy

Heavy CI, reusable dependency bundles and checkout-based project gates should live in `Semogtw/Offline-Toolchains` whenever possible. The private repository should avoid duplicating expensive Actions work.

If the current environment cannot execute a required gate because the runtime/toolchain is missing, document the missing capability and continue with resolvable code/documentation work. Do not weaken security invariants or the lockfile to force an unavailable environment to pass.

## Additional gate for remote MCP or agents

Before enabling Streamable HTTP, stdio bridge or another remote trigger:

```text
[ ] dedicated transport/agent design reviewed
[ ] exact SDK/API version verified
[ ] TLS and canonical URL verified
[ ] Host/Origin/DNS-rebinding policy verified as applicable
[ ] owner authentication, authorization and revocation verified
[ ] authorization occurs before private service invocation
[ ] sessions/conversations isolated across callers
[ ] request size, concurrency, timeout and cancellation limits verified
[ ] shared rate limiting verified for multi-instance deployment
[ ] private/no-store cache behavior verified
[ ] logs contain only correlation IDs and sanitized codes
[ ] tool/resource/prompt payloads excluded from normal logs
[ ] token/session rotation rehearsed
[ ] target client compatibility observed
[ ] endpoint disable/rollback switch verified
[ ] explicit owner approval received
```

Read-only annotations and browser cookies are not substitutes for transport security.

## Versioning

Before every production deployment:

1. preserve the reviewed Git commit and version tag;
2. record the exact migration state and dependency lockfile;
3. create/export a compatible database backup;
4. record runtime and Wrangler versions;
5. save anonymous/authenticated preview evidence;
6. update `CHANGELOG.md` and test evidence;
7. deploy once;
8. perform confidentiality, authentication and private-read smoke tests;
9. perform mutation smoke tests in whichever runtime owns mutations;
10. run MCP transport smoke tests only if a transport is intentionally enabled;
11. record the result or execute rollback.

## Cloudflare configuration

- `apps/api/wrangler.jsonc` is development-only until promotion review;
- keep `DB` as an explicit D1 binding;
- configure `SEMOGTW_OWNER_PASSWORD_HASH` and `SEMOGTW_SESSION_SECRET` only as Worker secrets;
- never commit production database IDs/secrets beyond intentionally public/non-secret development identifiers;
- validate cookies and CSRF on the actual preview/custom hostname;
- do not import the Node/SQLite package barrel into the Worker composition;
- apply remote migrations only after checkpoint/export planning.

## GitHub configuration

- configure `SEMOGTW_GITHUB_TOKEN` only in server/Worker secrets where a GitHub read adapter is actually composed;
- use a fine-grained token with Metadata/Contents read only;
- restrict repository selection;
- expose only a boolean configured state to the browser;
- ensure logs, audits, snapshots and MCP payloads contain no token/header;
- removing the token must disable new reads without deleting targets/evidence.

GitHub webhooks are not required for the current implementation. Any future webhook must validate signatures, filter tracked refs and persist normalized observations through a dedicated adapter.

## MCP configuration

No MCP secret or listener configuration currently exists. Do not add an environment variable that silently exposes an endpoint.

A future transport must use explicit fail-closed configuration. Missing authentication, canonical URL, isolation or rate-limit configuration must leave the endpoint disabled or deny all requests.

## Rollback

Rollback must preserve a compatible pair of code and schema. Destructive migrations are forbidden without a tested reverse path or forward-repair plan.

For additive D1 migrations, prefer Worker code rollback plus forward repair over deleting tables/columns. A code rollback must be verified to tolerate every migration already applied.

GitHub reads can be disabled by removing the token. MCP can remain excluded because it owns no table. Any future transport/agent must have an independent kill switch.

## Secrets and backups

Secrets are host-managed and never committed or embedded in browser output. Session-secret or password-hash rotation requires session revocation. GitHub token rotation requires a controlled read and confidentiality recheck.

SQLite backups contain authentication digests, repositories, observations, runs, reservations, gates, snapshots, audits and editorial data. D1 requires its own export/restore rehearsal and off-platform retention strategy before production.

## External services

Cloudflare is selected for SemogSite hosting direction. Oracle remains a separate infrastructure choice for the GoAnime/Jikan stack and is not part of this repository's runtime. Vercel, Netlify, Supabase, ChatGPT Sites and similar services are alternatives or auxiliary integrations only if a future architecture decision explicitly adopts them.
