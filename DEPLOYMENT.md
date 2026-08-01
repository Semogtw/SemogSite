# Deployment

## Current status

No production host or deployment mode is selected. No public deployment is authorized from `develop/foundation-bootstrap`.

## Capability verification

Before choosing mode A, B or C, verify and record:

- supported Node/edge runtime and framework adapter;
- persistent relational storage and transactional migration procedure;
- server-only secrets, including `SEMOGTW_GITHUB_TOKEN`;
- server routes/functions, cookies and CSRF behavior;
- static assets and file storage;
- stable remote MCP transport;
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

Web, API, database, auth and MCP share a compatible host. Prefer only when every essential capability is verified.

### B — External MCP bridge

Web, API and database stay together. A minimal external bridge exposes MCP and calls the same application contracts.

### C — External backend

The web frontend calls an external API/storage/MCP deployment. Business rules remain in shared TypeScript packages.

## Database baseline

A deployable database must contain, in order:

1. `0001_foundation.sql`;
2. `0002_seed_demo.sql`;
3. `0003_github_observations.sql`;
4. `0004_github_sync_runs.sql`.

`0004` preserves the original generic run fields and adds detailed integration counters. Code and schema rollback must keep this compatibility. Never mark a migration as applied manually after a partial failure.

## Pre-deploy gate

```text
[ ] branch and commit identified
[ ] dependency lockfile committed
[ ] domain, GitHub, database and web tests passed
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
[ ] 360 px and desktop reviewed
[ ] keyboard/focus reviewed
[ ] private cache and cookie behavior reviewed on the host
[ ] secrets scanner passed
[ ] public copy approved
[ ] rollback target recorded
[ ] explicit owner approval received
```

## Versioning

Before every production deployment:

1. preserve a git commit and annotated version tag;
2. record all applied migrations and schema backup;
3. save anonymous and authenticated preview evidence;
4. update `CHANGELOG.md`;
5. deploy once;
6. perform confidentiality, authentication and Operations smoke tests;
7. record the result or roll back.

## GitHub configuration

- configure `SEMOGTW_GITHUB_TOKEN` only in the server secret store;
- use a fine-grained token with Metadata read and Contents read only;
- restrict repository selection;
- verify the browser receives only a boolean configured state;
- verify logs, audit snapshots and database records contain no token or authorization header;
- removing the token must disable new reads without deleting targets or evidence.

## Rollback

Rollback must restore a compatible pair of application code and schema. Destructive migrations are forbidden without a tested reverse path or forward-repair plan.

After `0004`, rolling back to code that assumes only the original `sync_runs` columns is schema-compatible, but it will ignore detailed GitHub fields. Rolling back to code that inserts extended fields without preserving legacy required columns is not compatible and must be blocked.

If direct code rollback is unsafe, disable GitHub reads by removing the token and apply a reviewed forward repair. Existing observations and audit evidence remain private.

## Secrets

Secrets are configured in the host, never committed or embedded in browser output. Rotating the session secret invalidates CSRF tokens and requires session revocation. Rotating the password hash also requires session revocation. Rotating the GitHub token requires a controlled read and confidentiality recheck.

## External services

Cloudflare, Vercel, Netlify, Supabase and ChatGPT Sites remain unselected. Connect a deployment integration only after that service is part of the approved architecture and passes the capability matrix.
