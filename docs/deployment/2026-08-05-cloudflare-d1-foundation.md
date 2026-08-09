# Cloudflare Worker and D1 foundation

## Status

The Cloudflare production-adapter foundation is now integrated into `main` (PR #28, merged on August 8, 2026 local project time). It preserves the Node + `better-sqlite3` runtime for local development while adding a separate Cloudflare Worker + D1 composition.

The original August 5 evidence below remains historical evidence for the foundation slice; it is not automatically evidence for the current merged `main` head. Subsequent commits added D1-backed owner authentication, session persistence, login rate limiting, private read models, explicit liveness/readiness and browser-facing HTTP hardening. Mandatory gates must be rerun against the exact deployment candidate before promotion.

No production hostname or production D1 database is authorized by this document.

## Runtime composition

The Worker entry is:

```text
apps/api/src/worker.ts
```

It composes the runtime-neutral Hono application through:

```text
apps/api/src/composition/d1.ts
```

The D1 composition imports only explicit Worker-safe database subpaths. It must not import the main `@semogtw/database` barrel because that surface also exports the Node/SQLite adapter and can pull `better-sqlite3` into a Worker bundle.

The Worker composition currently provides:

- public project reads;
- owner session inspection, login and logout;
- D1-backed session persistence and revocation;
- D1-backed login rate limiting;
- private Overview, Hoje, Roadmap, Projetos, Auditoria and Workflows reads;
- `GET /health` as a non-cacheable liveness probe;
- `GET /ready` as fail-closed readiness bound to valid owner configuration and a queryable `0014` rate-limit table;
- same-origin and Fetch Metadata rejection for unsafe browser requests under auth/private routes;
- bounded JSON-only login requests;
- baseline browser security headers and sanitized/non-cacheable 404/500 responses;
- fail-closed private behavior when required auth secrets are absent or invalid.

CSRF tokens remain bound to the authenticated session and logout revocation is persisted through the D1 session store. Private write/mutation parity is not complete: the richer DevOS mutation surfaces still rely on the existing Node/SQLite server composition and must be ported or deliberately kept behind a split deployment mode before a fully Worker-hosted DevOS can be claimed.

### Probe semantics

`/health` answers whether the API runtime itself is alive. It deliberately does not prove that D1 schema/auth dependencies are available.

`/ready` is stricter. The D1 composition returns ready only when:

1. `SEMOGTW_OWNER_PASSWORD_HASH` and `SEMOGTW_SESSION_SECRET` parse into a valid auth configuration;
2. owner auth composition succeeds; and
3. `SELECT COUNT(*) FROM login_rate_limits` succeeds, proving the `0014_login_rate_limits.sql` storage dependency is present and queryable.

A failure returns a generic `503 SERVICE_NOT_READY`, `Retry-After`, correlation ID and `no-store`, without exposing whether the cause was a secret, schema or storage failure. This is a deployment/load-balancer signal, not a substitute for the complete promotion gate.

## Development database

The checked-in Wrangler configuration targets only the non-production database:

```text
name: semogsite-development
binding: DB
database id: d40eebf8-8f66-4856-bcee-6d300916fd9b
region observed at creation: ENAM
read replication: disabled
```

Configuration lives at:

```text
apps/api/wrangler.jsonc
```

The canonical migrations remain in:

```text
packages/database/migrations
```

Wrangler uses that canonical migration directory; there is no second Cloudflare-only migration history.

The merged runtime now includes `0014_login_rate_limits.sql` in addition to the original `0001`–`0013` foundation migrations.

## Historical observed gates — August 5 foundation slice

The following evidence was observed before the later auth/private-read commits and before merge into `main`:

```text
@semogtw/database: 55 files / 159 tests
@semogtw/api:       5 files / 11 tests
```

Both package typechecks passed for that earlier slice.

A Wrangler 4.118.0 dry run completed successfully:

```bash
wrangler deploy \
  --dry-run \
  --config apps/api/wrangler.jsonc \
  --outdir /tmp/semogsite-worker-dry-run
```

Observed bundle size at that point:

```text
upload: 408.98 KiB
gzip:    76.50 KiB
```

The bundle resolved `env.DB` and did not fail on the native SQLite module. The repository guardrail `pnpm check:cloudflare-worker-boundary` protects the explicit D1 imports, Worker entry, D1 binding, migration path and contiguous migration naming.

### Historical local D1 migration proof

The then-current canonical migrations were applied to a persisted local D1 database:

```bash
wrangler d1 migrations apply semogsite-development \
  --local \
  --config apps/api/wrangler.jsonc \
  --persist-to /tmp/semogsite-wrangler-state
```

Observed state for that historical run:

```text
d1_migrations rows: 13
application tables: 34
seeded projects:     1
```

That run exercised `0001` through `0013`. It predates `0014_login_rate_limits.sql`; therefore it must not be cited as proof that the current migration set has been applied successfully to D1.

## Validated merged checkpoint

Commit `7660dfbe4d507a12bf6df95bed01c92cc0b7f0b2` was checked out by the public `Semogtw/Offline-Toolchains` runner through the private-project CI bridge on August 8/9, 2026. The SemogSite job completed successfully through frozen dependency installation, native SQLite verification, boundary/confidentiality checks, focused domain/database/web gates, full `pnpm check`, production web build, isolated E2E database preparation and Playwright workflow privacy/mobile-navigation coverage.

That checkpoint included the first readiness route, same-origin guard and security-header slice. It predates later login request bounding, Fetch Metadata checks, standardized error responses and dedicated D1-readiness tests. Do not cite it as exact-head proof for those later commits.

## Current reproduction gates

With a compatible SemogSite toolchain/runtime, run at minimum:

```bash
pnpm check:cloudflare-worker-boundary
pnpm --filter @semogtw/database typecheck
pnpm --filter @semogtw/database test
pnpm --filter @semogtw/api typecheck
pnpm --filter @semogtw/api test

wrangler deploy \
  --dry-run \
  --config apps/api/wrangler.jsonc \
  --outdir /tmp/semogsite-worker-dry-run

wrangler d1 migrations apply semogsite-development \
  --local \
  --config apps/api/wrangler.jsonc \
  --persist-to /tmp/semogsite-wrangler-state
```

After any migration-set change, inspect the resulting migration table and application schema instead of reusing old counts.

Do not use `--remote` merely to repeat a local proof. Remote migrations require an explicit checkpoint, export/restore plan and inspection of the target database before mutation.

## HTTP hardening to verify at the edge

Local/in-process tests protect the application contract, but a real preview must still prove that Cloudflare preserves the intended behavior:

- `/health` and `/ready` remain `no-store`;
- an intentionally broken readiness dependency yields sanitized `503`, never a stale cached `200`;
- auth/private unsafe requests with a foreign `Origin` are rejected before private auth;
- `Sec-Fetch-Site: cross-site` unsafe requests are rejected even if `Origin` is absent;
- non-browser clients without browser metadata still reach the endpoint's auth/CSRF policy;
- login requests above 4 KiB and non-JSON login bodies are rejected before password verification;
- baseline `nosniff`, no-referrer, anti-framing and Permissions Policy headers survive the edge;
- auth/private responses keep `Cross-Origin-Resource-Policy: same-origin`;
- unknown routes and unhandled failures return correlation IDs without leaking storage, secret or provider details.

## Toolchain policy

Heavy CI/check-out work belongs in `Semogtw/Offline-Toolchains`. The private SemogSite repository should keep only lightweight coordination/stub workflows where useful. If a local environment cannot execute Wrangler or the native SQLite gates, document the missing capability and continue code work that does not depend on that gate.

The public toolchain must contain every dependency needed by the current lockfile before it is treated as an offline reproduction source. Do not weaken the project lockfile or silently download unreviewed transitive tooling to make a stale cache pass.

## Promotion blockers

Before a remote preview deployment is promoted:

- rerun database/API tests and typechecks against the exact merged `main` candidate;
- run the Worker boundary guard and a fresh Wrangler dry run;
- apply all current migrations, including `0014`, to a disposable/local D1 and inspect the resulting schema;
- apply migrations to the remote development D1 only after an explicit checkpoint;
- prove D1 export and restore into a separate database;
- decide whether the deployment is intentionally split (Worker reads/auth + Node mutation backend) or port the required private write surfaces to a Worker-safe D1 composition;
- run liveness/readiness, public/private HTTP and browser gates against a deployed preview;
- verify session cookies, origin/Fetch Metadata checks, login body constraints, CSRF, revocation and rate limiting through the real Cloudflare edge path;
- verify logs and observability do not expose private DTOs, branch data, sessions, password material or secrets;
- document rollback for both Worker code and additive D1 schema;
- confirm free-tier quotas with representative traffic;
- require explicit owner approval before production promotion.

The Node/SQLite adapter remains supported and is the reference path for private mutations until equivalent Worker-safe write adapters are deliberately implemented and verified.

## Relationship to MCP

This foundation does not expose MCP remotely. The MCP adapter remains in-process/read-only. Remote MCP requires its own authenticated transport design, isolation, origin/host validation, rate limiting, logging policy and rollback controls; it must not be inferred from the existence of the Cloudflare Worker API.
