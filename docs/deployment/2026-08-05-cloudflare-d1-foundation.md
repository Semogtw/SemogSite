# Cloudflare Worker and D1 foundation

## Status

The first production-adapter slice is implemented on the development branch. It preserves the Node + `better-sqlite3` runtime for local development while adding a separate Cloudflare Worker + D1 composition for public API reads.

This document records observed evidence from August 5, 2026. It does not authorize production promotion.

## Runtime composition

The Worker entry is:

```text
apps/api/src/worker.ts
```

It composes the existing runtime-neutral Hono application through:

```text
apps/api/src/composition/d1.ts
```

The D1 composition imports only explicit Worker-safe database subpaths:

```text
@semogtw/database/d1
@semogtw/database/d1-public-projects
```

It must not import the main `@semogtw/database` barrel, because that public surface also exports the Node/SQLite adapter and can pull `better-sqlite3` into a Worker bundle.

Private routes remain deliberately fail-closed. The D1 session store, owner authentication, CSRF persistence and private read models are separate migration slices and have not been enabled implicitly.

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

Wrangler is configured with a relative `migrations_dir`; migrations are not copied into a second Cloudflare-only history.

## Observed gates

### Database and API tests

The following focused gates passed before this document was written:

```text
@semogtw/database: 55 files / 159 tests
@semogtw/api:       5 files / 11 tests
```

Both package typechecks passed.

### Worker bundle boundary

A Wrangler 4.118.0 dry run completed successfully:

```bash
wrangler deploy \
  --dry-run \
  --config apps/api/wrangler.jsonc \
  --outdir /tmp/semogsite-worker-dry-run
```

Observed bundle size:

```text
upload: 408.98 KiB
gzip:    76.50 KiB
```

The bundle resolved `env.DB` and did not fail on the native SQLite module. The repository guardrail `pnpm check:cloudflare-worker-boundary` now protects the explicit D1 imports, Worker entry, D1 binding, migration path and contiguous migration naming.

### Local D1 migration proof

The canonical migrations were applied to a persisted local D1 database:

```bash
wrangler d1 migrations apply semogsite-development \
  --local \
  --config apps/api/wrangler.jsonc \
  --persist-to /tmp/semogsite-wrangler-state
```

Final observed state:

```text
d1_migrations rows: 13
application tables: 34
seeded projects:     1
```

This exercised migrations `0001` through `0013`, including the editorial triggers, against the local D1 runtime. Command timeouts during the first attempts were treated as resumable environment limits; Wrangler resumed idempotently and the final database was inspected directly.

## Reproduction commands

Activate the approved SemogSite toolchain, install the frozen workspace, and then run:

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

Do not use `--remote` merely to repeat a local proof. Remote migrations require an explicit checkpoint, export/restore plan and inspection of the target database before mutation.

## Toolchain limitation observed

The current public SemogSite toolchain can install its frozen reference workspace and run the bundled Wrangler. It did not fully resolve adding Wrangler to the real workspace manifest offline: the package manager requested transitive versions not present in the captured store.

Until the toolchain is regenerated and its add-dependency smoke passes:

- use the verified standalone Wrangler from the restored reference workspace for deployment gates;
- do not modify the project lockfile merely to accommodate a stale cache;
- keep repository scripts independent of a globally installed Wrangler;
- record Wrangler dry-run and migration commands as environment-dependent gates rather than making `pnpm check` download tooling.

## Promotion blockers

Before remote preview deployment:

- apply all migrations to the remote development D1 and inspect the resulting schema;
- prove a D1 export and restore into a separate database;
- add D1 session storage and owner authentication without weakening fail-closed behavior;
- port private read models and CSRF/revocation persistence;
- run public/private HTTP and browser gates against a deployed preview;
- verify logs and observability do not expose private DTOs, branch data, sessions or secrets;
- document rollback for both Worker code and additive D1 schema;
- confirm free-tier quotas with representative traffic.

The Node/SQLite adapter remains supported until these gates pass. No production database or public hostname is configured by this foundation slice.
