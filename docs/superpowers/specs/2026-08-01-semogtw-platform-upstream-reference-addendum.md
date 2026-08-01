# Semogtw Platform — Upstream Reference Addendum

**Status:** Approved amendment derived from product specification v2.1  
**Date:** 2026-08-01  
**Applies to:** `docs/superpowers/specs/2026-08-01-semogtw-platform-foundation-design.md`  
**Upstream:** `krisnarane/pdi-template`  
**Inspected commit:** `8be932139e913b1ff050b0bf938910abae52a044` (`template pdi`, 2026-07-28)

## 1. Purpose of this amendment

The product specification v2.1 authorizes `krisnarane/pdi-template` as a selective technical and visual reference. This amendment incorporates that reference without weakening the already approved Semogtw requirements for portability, private-data isolation, evidence-based status, revocable authentication, and a distinct identity.

The upstream is not treated as a finished application to rename. It is an implementation accelerator whose modules are classified before use as **reuse**, **adapt**, **rewrite**, or **discard**.

## 2. Architectural amendment

The web application baseline changes from React Router framework mode to **TanStack Start + TanStack Router + TanStack Query** because:

- the inspected upstream already supplies a functional TanStack shell, routing model, Query provider, metadata, 404/error boundaries, server functions, and responsive navigation patterns;
- current TanStack Start documentation describes full-document SSR, streaming, server functions, Vite support, and deployment to Node, Bun, Cloudflare, Netlify, Railway, Vercel, Appwrite Sites, and Nitro;
- preserving TanStack Start in the web layer reduces reimplementation while the portable domain and API layers remain framework-independent.

This does not make TanStack Start the domain boundary. The architecture remains:

```text
apps/web        TanStack Start UI, SSR, loaders and route actions
apps/api        Hono HTTP API and future MCP bridge entry point
packages/domain Framework-independent entities, invariants and services
packages/contracts Zod schemas and explicit public/private DTOs
packages/database SQL repositories and runtime-specific adapters
packages/auth   AuthProvider, password hashing and revocable sessions
packages/ui     Semogtw design tokens and reusable components
```

Hono remains the canonical versioned API surface. TanStack server functions may call the same application services directly for web interactions, but must not duplicate validation, authorization, audit, or business rules.

## 3. Hosting and storage posture

Cloudflare D1 and Wrangler from the upstream are **optional adapters**, not the initial universal contract.

Initial baseline:

- local Node runtime;
- SQLite-compatible schema;
- repository interfaces independent of D1;
- local SQLite adapter for development and tests;
- typed environment adapter;
- no production host selected.

If Cloudflare is selected later, the upstream binding pattern may be adapted into a D1 adapter. Until that evidence exists, Cloudflare imports must remain outside domain and application packages.

## 4. Authentication amendment

The upstream `src/api/auth.ts` is useful only as a reference for:

- `HttpOnly`, `SameSite=Lax`, path-scoped cookie configuration;
- Web Crypto HMAC operations;
- timing-resistant comparisons;
- server-side mutation middleware.

It is not reused as the Semogtw authentication model because it uses a single raw password secret and stateless signed sessions. The approved local provider must instead provide:

- password hash configuration, never a raw password environment variable;
- rate-limited generic login failures;
- at least 32 random bytes per session token;
- only a token digest persisted in the database;
- absolute expiration and revocation;
- CSRF protection for authenticated mutations;
- fail-closed behavior when configuration is absent;
- an `AuthProvider` interface replaceable by a future external provider.

## 5. Upstream adoption decisions

| Upstream area | Decision | Semogtw treatment |
|---|---|---|
| `package.json` | adapt | Keep TanStack Start/Router/Query, React, Vite, Zod, selected Radix primitives and Vitest. Remove dependencies without an accepted use case. Add workspace, Hono, database, lint, E2E and strict TypeScript tooling. |
| `src/routes/__root.tsx` | adapt | Keep root shell concepts, Query provider, metadata hooks, 404/error boundaries and pre-paint theme bootstrap. Split public and DevOS shells and remove PDI/profile coupling. |
| `src/components/layout/Navbar.tsx` | rewrite from behavior | Preserve responsive menu, active-state and theme-toggle behavior. Create separate `PublicHeader`, `DevOSSidebar` and `DevOSBottomNav` with Semogtw routes and density. |
| `src/components/sections/HeroSection.tsx` | rewrite from composition | Preserve responsive composition lessons only. Replace all copy, profile assumptions, timers, imagery, icon choices, gradients and card structure. |
| `src/components/ui-custom/GradientCard.tsx` | discard | Replace with tokenized neutral `Surface`, `Panel` and `Callout` primitives. No generic gradient-card visual language. |
| Radix-based primitives | selectively adapt | Retain only primitives needed by accepted flows; restyle through Semogtw tokens and verify keyboard/focus behavior. |
| `src/api/auth.ts` | rewrite | Reuse no session model. Implement the approved revocable local provider behind `AuthProvider`. |
| `src/api/bindings.ts` | conditional adapt | Generalize environment contracts. Add a D1/Cloudflare adapter only when deployment selection justifies it. |
| `src/api/*.ts` CRUD patterns | rewrite around services | Keep Zod validation and protected mutation concepts. Remove direct SQL from handlers and route all work through application services and repository interfaces. |
| `migrations/*` | discard schema and seeds; adapt conventions | Preserve only ordered SQL migration conventions. Build the Semogtw schema from the canonical data model and exclude all PDI sample data. |
| `src/routes/admin.*` forms | adapt interaction patterns | Preserve accessible labels, loading state and feedback patterns. Rebuild routes under `/devos`, with owner authorization and Semogtw copy. |
| Vitest setup and tests | adapt | Keep lightweight test execution. Replace sanity-only coverage with domain, DTO-isolation, auth, API and migration tests. |
| profile data, PDI taxonomy, images and seeds | discard | Must never enter SemogSite history, previews, public output, metadata or migrations. |

The complete evidence and file-level matrix live in `docs/UPSTREAM_REFERENCE.md`.

## 6. Attribution and licensing record

No `LICENSE` file was found at the inspected upstream commit. The project records the authorization statement supplied by the owner of the Semogtw specification and preserves upstream attribution in `THIRD_PARTY_NOTICES.md`.

Implementation rules:

1. record every upstream file whose code or structure materially influences a Semogtw file;
2. retain existing notices found in imported files;
3. prefer clean adaptation of behavior and architecture where exact copying is unnecessary;
4. never imply that upstream authors endorse Semogtw;
5. update the commit pin and adoption matrix before consuming a newer upstream revision.

## 7. Design independence

The reference does not change the Semogtw visual direction. The implementation must remove:

- PDI/career-plan taxonomy;
- personal names and sample profile data;
- literal gradient branding;
- oversized decorative emojis;
- internship timers and skill-level framing;
- any appearance of a renamed template.

The public site remains editorial and spacious. Semogtw DevOS remains operational and denser. Both share a bespoke token system, typography, icon family selected through Supericons, and accessible interaction patterns.

## 8. Planning consequence

The first implementation task is now an upstream intake gate. No equivalent shell, navigation, authentication, CRUD, migration or test infrastructure may be built before:

- `docs/UPSTREAM_REFERENCE.md` identifies the inspected commit and matrix;
- `THIRD_PARTY_NOTICES.md` records provenance;
- dependencies are audited for actual use;
- all upstream personal/PDI assets are explicitly excluded;
- the architecture boundary tests confirm that domain packages do not import TanStack, Hono, Wrangler, D1 or UI code.

All other requirements in the approved foundation design remain in force.