# Testing

## Standard commands

```bash
pnpm install
pnpm check
pnpm build
```

Package-specific examples:

```bash
pnpm --filter @semogtw/domain test
pnpm --filter @semogtw/auth test
pnpm --filter @semogtw/contracts test
pnpm --filter @semogtw/database test
pnpm --filter @semogtw/api test
pnpm --filter @semogtw/ui test
pnpm --filter @semogtw/web test
```

## Required matrix

### Unit

- stage invariants;
- Today ordering and project-slug continuity;
- Roadmap filtering/grouping;
- agent-context sanitization and size cap;
- public DTO allowlists;
- password hashing and verification;
- session digest, expiry and revocation;
- password rotation revoking active sessions;
- CSRF, logout policy and rate limiting;
- safe post-login destination allowlist;
- browser cookie parsing;
- runtime configuration fail-closed.

### Integration

- SQLite migrations and repository contracts;
- semantic project-priority ordering;
- SQLite Overview, Today, Projects/hub and Roadmap data sources;
- Hono public/private isolation;
- incomplete editorial records omitted from public APIs;
- private response `no-store` headers;
- private service not called before authorization;
- Node/SQLite auth composition and 14-day session lifetime;
- TanStack private route redirect before data loader;
- public route metadata and anonymous rendering;
- functional mobile menu and UI accessibility matchers.

### E2E, before deployment

- anonymous public routes at 360 × 800 and desktop;
- `/devos` redirect and login;
- authenticated Overview, Hoje, Projetos, hub and Roadmap with SQLite data;
- all secondary private routes protected;
- logout, CSRF rejection and revoked-session denial;
- password rotation invalidating existing sessions;
- no horizontal overflow;
- keyboard navigation, mobile menu and visible focus;
- public HTML/payload/metadata/sitemap/robots confidentiality scan;
- private API and page cache behavior on the selected host.

## Evidence from this implementation environment

The connected environment provides Node.js `v22.16.0`, but its internal npm registry returned HTTP 404 for required packages and the private repository could not be cloned from the network. Therefore the full workspace install, typecheck, Vitest suite and Vite build are **not claimed as executed**.

Equivalent pure behavior was exercised with Node's native facilities where possible:

- roadmap stage validation: 4 tests passed, 0 failed;
- local password/session provider: 2 tests passed, 0 failed;
- public confidentiality scanner behavior: passed;
- upstream marker scanner behavior: passed;
- empty-tree upstream and domain-boundary commands: passed.

The committed Vitest suites additionally specify the expected behavior for:

- runtime auth composition;
- project priority ordering;
- credential-rotation revocation;
- Overview/Today/Project/Roadmap SQLite reads;
- public API isolation and cache headers;
- mobile menu behavior;
- cookie parsing, logout CSRF and safe redirects.

These committed tests are specifications until observed in a dependency-complete environment. They are not marked passed merely because they exist.

## Environment gate

The next environment with full npm access must execute, in order:

```bash
corepack enable
pnpm install --frozen-lockfile=false
pnpm check
pnpm build
```

Because no lockfile exists yet, the first successful install must create and commit `pnpm-lock.yaml`. Any API mismatch in TanStack Start RC, Drizzle, Hono or Vite must be fixed from official/current documentation and captured in `CHANGELOG.md`.

After build:

```bash
pnpm --filter @semogtw/web dev
```

Run anonymous and authenticated browser checks before declaring any route or confidentiality gate complete.

GitHub Actions should not be used merely to compensate for this environment limitation. Prefer a local/agent runtime with package access; use CI only when it becomes an essential release gate.
