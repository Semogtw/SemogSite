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
- Today ordering;
- Roadmap filtering/grouping;
- agent-context sanitization and size cap;
- public DTO allowlists;
- password hashing and verification;
- session digest, expiry and revocation;
- CSRF and rate limiting;
- runtime configuration fail-closed.

### Integration

- SQLite migrations and repository contracts;
- Hono public/private isolation;
- private service not called before authorization;
- TanStack private route redirect before data loader;
- public route metadata and anonymous rendering.

### E2E, before deployment

- anonymous public routes at 360 × 800 and desktop;
- `/devos` redirect and login;
- authenticated Overview, Hoje, Projetos, hub and Roadmap;
- logout and revoked-session denial;
- no horizontal overflow;
- keyboard navigation and visible focus;
- public HTML/payload/metadata/sitemap/robots confidentiality scan.

## Evidence from this implementation environment

The connected environment provides Node.js `v22.16.0`, but its internal npm registry returned HTTP 404 for Vitest and pnpm was not preinstalled. Therefore the full workspace install, typecheck, Vitest suite and Vite build are **not claimed as executed**.

Equivalent pure TypeScript behavior was exercised with Node's native test runner and type stripping:

- roadmap stage validation: 4 tests passed, 0 failed;
- local password/session provider: 2 tests passed, 0 failed;
- upstream marker scanner behavior: passed;
- empty-tree upstream and domain-boundary commands: passed.

These checks are supplementary evidence, not substitutes for `pnpm check` and `pnpm build` in an environment with the declared dependencies.

## Environment gate

The next environment with full npm access must execute, in order:

```bash
corepack enable
pnpm install --frozen-lockfile=false
pnpm check
pnpm build
```

Because no lockfile exists yet, the first successful install must create and commit `pnpm-lock.yaml`. Any API mismatch in TanStack Start RC, Drizzle or Hono must be fixed from official/current documentation and captured in `CHANGELOG.md`.

GitHub Actions should not be used merely to compensate for this environment limitation. Prefer a local/agent runtime with package access; use CI only when it becomes an essential release gate.
