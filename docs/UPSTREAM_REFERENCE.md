# Upstream Reference — `krisnarane/pdi-template`

## Snapshot

| Field | Value |
|---|---|
| Repository | `https://github.com/krisnarane/pdi-template` |
| Visibility | Public |
| Default branch | `main` |
| Commit inspected | `8be932139e913b1ff050b0bf938910abae52a044` |
| Commit message | `template pdi` |
| Commit date | 2026-07-28 22:45:39 UTC |
| Analysis date | 2026-08-01 |
| Role | Selective technical and visual reference for the Semogtw platform foundation |
| License file | None found at the inspected commit |
| Authorization record | Reuse was authorized in the Semogtw product specification v2.1; attribution and the absence of a repository license are recorded in `THIRD_PARTY_NOTICES.md`. |

## Decision summary

The upstream is useful as a compact TanStack Start application with responsive navigation, server functions, D1 bindings, basic protected mutations, Radix-based components and Vitest setup. It is not suitable as a direct product base without reconstruction because it couples PDI content, a single public shell, direct SQL handlers, a raw-password secret, stateless admin sessions and Cloudflare-specific bindings.

SemogSite will use **TanStack Start/Router/Query in the web layer**, retain **Hono as the versioned API**, and keep domain, contracts, database and authentication behind independent packages. No PDI data, taxonomy, images or branding may be copied.

## Inspected files and adoption matrix

| Upstream file/area | Observed behavior | Decision | Target in SemogSite | Required changes |
|---|---|---|---|---|
| `package.json` | React 18, TanStack Router/Start/Query, Vite, Zod, many Radix packages, Recharts, Lucide, Vitest and Wrangler in a single package. | Adapt | root workspace manifests; `apps/web/package.json`; package manifests | Convert to pnpm workspace; pin compatible versions after Context7 verification; add Hono, database, lint and Playwright tooling; remove unused Radix packages, Recharts until Insights, carousel/OTP/resizable dependencies unless accepted by a concrete feature. |
| `vite.config.ts` | Minimal Vite React + path aliases. | Adapt | `apps/web/vite.config.ts` | Use TanStack Start plugin/configuration rather than plain React-only build; preserve path aliases; keep host-specific plugins out of shared packages. |
| `src/routes/__root.tsx` | Query provider, root metadata, theme bootstrap, global Navbar/Footer, 404 and error UI, admin status loaded before every route. | Adapt | `apps/web/src/routes/__root.tsx`; public/private layouts | Keep root document, Query provider, theme bootstrap and error boundaries. Move owner resolution to protected route layout, split public shell from DevOS shell, remove profile/PDI metadata and avoid logging unsanitized errors. |
| `src/components/layout/Navbar.tsx` | Desktop/mobile menu, active links, theme toggle, admin status and logout. | Rewrite from behavior | `packages/ui/src/navigation/*`; `apps/web/src/components/*` | Build `PublicHeader`, `DevOSSidebar`, `DevOSBottomNav` and overflow menu; use Semogtw routes, selected SVGs and 44 px targets; do not retain PDI labels, sparkle branding or a single navigation density. |
| `src/components/sections/HeroSection.tsx` | Responsive two-column hero, profile summary card, social actions, gradient treatment and internship timer. | Rewrite from composition | `packages/ui/src/public/editorial-hero.tsx`; home route | Preserve only hierarchy and responsive lessons. Replace profile-card résumé structure, timer, PDI badge, copy, imagery and gradients with the Semogtw editorial direction. |
| `src/components/ui-custom/GradientCard.tsx` | Generic gradient border wrapper with glow. | Discard | `packages/ui/src/primitives/surface.tsx` | Create neutral tokenized `Surface`, `Panel` and `Callout`; avoid a template-like gradient-card language. |
| Radix UI components | Broad primitive inventory. | Selectively adapt | `packages/ui/src/primitives/*` | Keep only components required by accepted routes; normalize tokens, focus rings, reduced motion and semantic errors; tree-shake unused packages. |
| `src/api/auth.ts` | Raw `ADMIN_PASSWORD`, HMAC-signed 30-day stateless cookie, constant-time digest comparison, server mutation middleware, `HttpOnly` and `SameSite=Lax`. | Rewrite | `packages/auth/*`; web auth actions; API middleware | Keep only secure-cookie and timing-resistant comparison concepts. Store password hash, create random revocable DB sessions, hash tokens at rest, add rate limit, CSRF, absolute expiry, generic failures and fail-closed configuration. Cookie name becomes Semogtw-specific. |
| `src/api/bindings.ts` | Cloudflare D1 and secrets loaded through Wrangler proxy in development and `cloudflare:workers` in production. | Conditional adapt | `packages/config`; `packages/database/adapters/d1` | Define generic typed runtime configuration first. Port the proxy/binding pattern only when Cloudflare is selected and verified; never import Wrangler or Cloudflare from domain/application packages. |
| `src/api/goals.ts` and sibling API modules | Zod validation, protected mutations, D1 SQL directly in server-function handlers, row mapping. | Rewrite around services | `packages/contracts`; `packages/domain`; `packages/database`; web actions; Hono routes | Retain schema-first validation and compact handler style. Move SQL to repositories, rules to application services, authorization/audit to middleware/services, and public output to allowlist DTOs. Remove delete operations not allowed in MVP. |
| `src/routes/admin.login.tsx` | Labeled password form, loading state, toast feedback, redirect; literal personal name and admin copy. | Adapt interaction patterns | `/devos/login` route and auth form | Keep accessible form structure and pending state. Use generic failures, safe return URL, autocomplete attributes, CSRF token, rate-limit messaging, Semogtw copy and no personal-name remnants. |
| `migrations/0001*` and seed migrations | D1/SQLite-compatible ordered SQL files for PDI goals, contributions, roadmap and soft skills plus personal sample content. | Discard schema and seeds; adapt convention | `packages/database/migrations/*` | Preserve ordered, reversible migration discipline only. Implement canonical Semogtw entities and auth sessions. Never copy upstream table names or sample rows. |
| `src/api/sanity.test.ts` | Vitest smoke assertion. | Adapt infrastructure only | root and package test configuration | Keep Vitest runner setup. Replace trivial smoke coverage with domain invariants, serializers, auth, repository contract and route tests. |
| `src/api/career.test.ts`, `events.test.ts`, rule tests | Focused API/rule tests around PDI data. | Adapt test style selectively | package-level test suites | Reuse patterns only when they demonstrate isolated behavior; rewrite fixtures and assertions around Semogtw contracts. |
| `src/data/profile.ts` | Personal profile data used directly by metadata and sections. | Discard | approved public content seed later | No upstream personal data enters the repository. Public Semogtw content must be explicit, approved and serialized through public DTOs. |
| `public/images/*` and personal assets | Upstream identity imagery. | Discard | Semogtw-owned assets | Do not download, copy or retain. Figma/Canva assets require Semogtw-specific creation and alt text. |
| README and setup script | Cloudflare-oriented template customization instructions and PDI seed workflow. | Rewrite | `README.md`, `DEPLOYMENT.md`, scripts | Document the Semogtw architecture, local Node baseline, optional adapters, secure auth setup and no-host-selected status. Reuse no PDI instructions. |

## Dependency disposition

### Keep in the initial web foundation

- React and React DOM;
- TanStack Start;
- TanStack Router;
- TanStack Query;
- Zod;
- a minimal accepted subset of Radix primitives;
- class composition utilities when used consistently;
- Vite and TypeScript;
- Vitest.

### Add for Semogtw architecture

- Hono for the explicit versioned HTTP API;
- Drizzle ORM and the selected local SQLite driver;
- pnpm workspaces and shared TypeScript configuration;
- lint/format tooling;
- Playwright for browser/security checks;
- a Node password-hashing/session adapter behind interfaces;
- dependency-boundary checks.

### Defer until a feature requires them

- Recharts until Insights;
- command palette package until global search/actions are implemented;
- carousel, OTP, resizable panels, date picker and drawer packages;
- Wrangler and Cloudflare types until the host decision selects Cloudflare;
- Storybook until the component foundation is stable.

### Remove from copied baseline

- dependencies used only by PDI sections or unused generated primitives;
- Lucide as an automatic icon dependency if exact SVGs selected through Supericons cover the accepted interface;
- any package retained only to preserve upstream fidelity.

## Security findings that affect adoption

1. The upstream raw password environment variable is not acceptable for Semogtw.
2. Stateless signed sessions cannot be individually revoked and therefore do not satisfy the approved authentication contract.
3. Direct SQL in server handlers would duplicate rules across web, API and MCP and is not adopted.
4. Root-level admin-status loading would perform private authentication work for public routes and is moved into the protected layout.
5. `console.error(error)` in the root boundary can expose unsanitized details and is replaced by structured sanitized logging.
6. The upstream public shell and data model do not provide public/private DTO isolation.
7. No `LICENSE` file was found at the inspected commit; provenance and authorization must remain explicit.

## Upstream update procedure

Before consuming a newer upstream revision:

1. fetch the latest `main` commit;
2. compare it with `8be932139e913b1ff050b0bf938910abae52a044`;
3. review changed files for new personal data, dependencies, security behavior and notices;
4. update this matrix and `THIRD_PARTY_NOTICES.md`;
5. adopt changes only through a dedicated commit with tests;
6. never merge the upstream repository wholesale into `SemogSite`.

## Traceability requirement

Any SemogSite commit that materially adapts an upstream module must mention the upstream path in its commit body or accompanying documentation and update `THIRD_PARTY_NOTICES.md` when copied code or distinctive structure is retained.