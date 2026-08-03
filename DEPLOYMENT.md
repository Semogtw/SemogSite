# Deployment

## Current status

No production host or deployment mode is selected. No public deployment is authorized from `develop/workflow-control-core`.

The private DevOS, editorial/public web foundation, GitHub read adapter, cooperative run ledger and workflow orchestration core are implemented. The MCP adapter remains in-process only; no stdio or remote transport is enabled.

## Capability verification

Before choosing mode A, B or C, verify and record:

- supported Node/edge runtime and framework adapter;
- persistent relational storage and transactional migration procedure;
- server-only secrets, including auth and `SEMOGTW_GITHUB_TOKEN`;
- server routes/functions, cookies and CSRF behavior;
- static assets/file storage;
- webhook reception and signature validation when used;
- scheduled/background execution when required;
- outbound HTTPS access and GitHub rate-limit behavior;
- stable authenticated remote MCP transport, if enabled;
- custom domain/canonical URL and preview environments;
- version history, logs, metrics, encrypted backups and rollback.

A capability is unavailable until demonstrated in the selected environment. The current workflow orchestration core does not require a scheduler because expiration and staleness are derived at read time.

## Modes

### A — Unified

Web, API, database, auth and authenticated MCP share a compatible host. Select only when every essential capability is verified.

### B — External MCP bridge

Web, API and database remain together. A minimal authenticated bridge exposes MCP and invokes the same application contracts.

### C — External backend

The web frontend calls an external API/storage/MCP deployment. Business rules remain in shared TypeScript packages.

The current MCP packages can support any mode because they open no listener and depend on an already-open database plus provider-neutral read service.

## Database baseline

A deployable database must contain, in order:

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
13. `0013_recovery_snapshots.sql`.

Migrations are additive and must be applied transactionally. Never mark a partially executed migration as applied. The build verifies all 13 files in the SSR bundle and none in the client bundle.

Reservations, gates and recovery snapshots are private canonical data and must be included in backups/restores. MCP owns no separate schema.

## Pre-deploy gate

```text
[ ] branch, commit and PR merge tree identified
[ ] dependency lockfile committed and frozen install passed
[ ] native SQLite artifact verified
[ ] package/MCP/public-confidentiality guardrails passed
[ ] all workspace typechecks passed
[ ] pnpm check passed
[ ] production client/SSR build passed
[ ] migrations 0001–0013 verified server-only
[ ] migrations apply twice idempotently to disposable storage
[ ] verified backup created and restore rehearsed
[ ] anonymous routes expose no private operational markers
[ ] authenticated Overview/Hoje/Projetos/Roadmap/Operação/Auditoria/Fluxos smoke tests passed
[ ] repository registration, lifecycle and recommendation acceptance reviewed
[ ] GitHub success/partial/rate-limited reads reviewed without provider writes
[ ] reservation creation, overlap, expiry and owner override reviewed
[ ] exact-SHA gate creation and classified result reviewed
[ ] recovery snapshot creation reviewed with a real persisted branch observation
[ ] recovery without branch observation fails closed
[ ] safe-work default has no invented runtime capabilities
[ ] session-only capability evaluation reviewed
[ ] MCP catalog contains only approved read resources/tools
[ ] no MCP transport listener or mutation tool is present
[ ] desktop and 360 px layouts reviewed
[ ] keyboard/focus reviewed for sensitive forms
[ ] private cache/cookie behavior verified on the host
[ ] secrets scanner and public copy review passed
[ ] rollback target and compatible backup recorded
[ ] explicit owner approval received
```

Run `30841132598` observed the repository-wide checks, build and workflow browser mutations on commit `94956d10f805e13af7f11e5e2e4f63e8e4abe4b8`. Documentation changes after that commit require a final full run before merge.

The checklist authorizes only the reviewed web/API/private foundation. It does not authorize remote MCP or automated external-agent execution.

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

Read-only annotations and browser cookies are not substitutes for these controls.

## Versioning

Before every production deployment:

1. preserve the reviewed Git commit and annotated version tag;
2. record the exact 13-migration state, dependency lockfile and schema backup;
3. record installed runtime/SDK versions;
4. save anonymous and authenticated preview evidence;
5. update `CHANGELOG.md` and test evidence;
6. deploy once;
7. perform confidentiality, authentication, workflow and Operations smoke tests;
8. run MCP transport smoke tests only when such a transport is intentionally enabled;
9. record the result or execute rollback.

## GitHub configuration

- configure `SEMOGTW_GITHUB_TOKEN` only in server secrets;
- use a fine-grained token with Metadata/Contents read only;
- restrict repository selection;
- expose only a boolean configured state to the browser;
- ensure logs, audits, snapshots and MCP payloads contain no token/header;
- removing the token must disable new reads without deleting targets/evidence.

GitHub webhooks are not required for the current implementation. A future push webhook must validate `X-Hub-Signature-256`, filter the tracked branch and persist normalized observations through a dedicated adapter.

## MCP configuration

No MCP secret or listener configuration currently exists. Do not add an environment variable that silently exposes an endpoint.

A future transport must use explicit fail-closed configuration. Missing authentication, canonical URL, isolation or rate-limit configuration must leave the endpoint disabled or deny all requests.

## Rollback

Rollback must restore a compatible pair of code and schema. Destructive migrations are forbidden without a tested reverse path or forward-repair plan.

After migrations `0011`–`0013`, rolling back to code unaware of workflow tables may leave them unused but intact; it must not delete or reinterpret their data. Prefer disabling private navigation/feature adapters and applying a reviewed forward repair when schema rollback is unsafe.

GitHub reads can be disabled by removing the token. The current MCP adapter can be excluded without data migration because it owns no table. Any future transport/agent must have an independent kill switch.

## Secrets and backups

Secrets are host-managed and never committed or embedded in browser output. Session-secret or password-hash rotation requires session revocation. GitHub token rotation requires a controlled read and confidentiality recheck.

Backups contain authentication digests, repositories, observations, runs, reservations, gates, snapshots, audits and editorial drafts. Production requires encryption, access control, off-device retention and a rehearsed restore.

## External services

Cloudflare, Vercel, Netlify, Supabase, ChatGPT Sites and Workspace Agents remain unselected deployment/integration options. Connect one only after it is part of the approved architecture and passes the capability matrix.