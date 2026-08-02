# Handoff — editorial foundation — 2026-08-01

## Repository state

- Repository: `Semogtw/SemogSite`
- Branch: `develop/foundation-bootstrap`
- Pull request: #1
- PR remains draft.

## Plans

- `docs/superpowers/plans/2026-08-01-semogtw-editorial-workflow.md`
- `docs/testing/2026-08-01-editorial-test-matrix.md`
- `docs/security/2026-08-01-editorial-threat-model.md`
- `docs/verification/2026-08-01-editorial-foundation-review.md`

## Work completed

### Domain

- `packages/domain/src/editorial/editorial-workflow.ts`
- `packages/domain/src/editorial/editorial-workflow.test.ts`
- `packages/domain/src/editorial/editorial-write-service.ts`
- `packages/domain/src/editorial/editorial-write-service.test.ts`
- `packages/domain/src/editorial/index.ts`

### Database

- migrations `0006`–`0009`;
- `packages/database/src/schema/editorial.ts`;
- migration/trigger specs;
- `SqliteEditorialWriteRepository` and specs;
- `SqliteEditorialReadModel` and specs;
- corrected `SqlitePublishedEditorialReadModel` and specs;
- provisional `published-editorial-source.ts` exists but must not be exported/adopted.

### Contracts and security

- strict public editorial DTO/test;
- editorial confidentiality scanner/test;
- editorial schema consistency scanner/test;
- standalone editorial guardrail runner;
- `EDITORIAL.md`;
- threat model/test matrix/review.

## Tests actually executed

No current-HEAD dependency-complete editorial suite was observed in the connected environment.

The new tests are executable specifications only. Do not report them as passing until run against the exact branch HEAD.

## Known integration blockers

1. Root package barrels and composed database schema do not yet export editorial modules safely.
2. Adopt only `published-editorial-read-model.ts`; remove the provisional source after focused gates.
3. Pure revision creation API must accept repository-authoritative sequence.
4. Publish/rollback approval lookup must not use a synthetic approval ID.
5. Exact retries must remain idempotent after later document transitions without rewinding state.
6. Stable request fingerprints are required before remote writes.
7. Migration runner/backup expectations must advance through `0009`.

These blockers are tracked in GitHub issues created during the session.

## Security/privacy boundary

- No owner editorial UI was added.
- No public editorial route was added.
- No markdown renderer was selected.
- No content was published.
- No autonomous/scheduled publication exists.
- No remote editorial MCP/HTTP write surface exists.
- Public projection is designed to use only the exact published revision and its publication event.

## Exact next execution

```bash
corepack enable
pnpm install --frozen-lockfile
node scripts/check-editorial-guardrails.mjs
pnpm --filter @semogtw/domain typecheck
pnpm --filter @semogtw/domain test -- editorial
pnpm --filter @semogtw/contracts typecheck
pnpm --filter @semogtw/contracts test -- editorial
pnpm --filter @semogtw/database typecheck
pnpm --filter @semogtw/database test -- editorial
```

Fix package exports and the first real diagnostic. Then execute migrations `0001`–`0009`, backup/restore, replay-idempotency tests and full workspace gates.

Do not implement owner/public routes until the corrected public adapter and write-service blockers are resolved.