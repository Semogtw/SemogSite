# Deployment

## Current status

No production host or deployment mode is selected. No public deployment is authorized from this foundation branch.

## Capability verification

Before choosing mode A, B or C, verify and record:

- supported Node/edge runtime and framework adapter;
- persistent relational storage and migration procedure;
- server-only secrets;
- server routes/functions and cookie behavior;
- static assets and file storage;
- stable remote MCP transport;
- webhook reception;
- scheduled/background execution;
- custom domain and canonical URL;
- preview environments;
- version history and rollback;
- logs, metrics and backups.

A capability is unavailable until demonstrated in the target environment.

## Modes

### A — Unified

Web, API, database, auth and MCP share a compatible host. Prefer this only when every essential capability is verified.

### B — External MCP bridge

Web, API and database stay together. A minimal external bridge exposes MCP and calls the same API/application contracts.

### C — External backend

The web frontend calls an external API/storage/MCP deployment. Business rules remain in shared TypeScript packages.

## Pre-deploy gate

```text
[ ] branch and commit identified
[ ] dependency lockfile committed
[ ] pnpm check passed
[ ] pnpm build passed
[ ] migrations applied to a disposable preview database
[ ] anonymous confidentiality tests passed
[ ] authenticated smoke tests passed
[ ] 360 px and desktop reviewed
[ ] keyboard/focus reviewed
[ ] secrets scanner passed
[ ] public copy approved
[ ] backup created
[ ] rollback target recorded
[ ] explicit owner approval received
```

## Versioning

Before every production deployment:

1. preserve a git commit and annotated version tag;
2. record schema version and migration list;
3. export/backup storage;
4. save preview evidence;
5. update `CHANGELOG.md`;
6. deploy once;
7. perform anonymous and authenticated smoke tests;
8. record the result or roll back.

## Rollback

Rollback must restore a compatible pair of application code and schema. Destructive migrations are forbidden without a tested reverse path or forward-repair plan. If code rollback is incompatible with the migrated schema, disable the affected feature and apply the documented repair migration rather than guessing.

## Secrets

Secrets are configured in the host, not committed or embedded in the browser build. Rotating the session secret invalidates CSRF tokens and should revoke all active sessions. Rotating the password hash does not expose the password and should also be followed by session revocation.

## External services

Cloudflare, Vercel, Netlify, Supabase and ChatGPT Sites remain unselected. Connect the corresponding MCP or deployment integration only after that service is part of the actual architecture.
