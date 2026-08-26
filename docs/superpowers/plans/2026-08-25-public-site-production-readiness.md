# Public Site Production Readiness Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** deixar a superfície pública do SemogSite pronta para produção, de forma independente do preenchimento de dados pessoais/conteúdo, com semântica HTTP correta, SEO/discovery robustos, metadata/identidade de navegador, segurança de entrega, mídia editorial segura, responsividade e gates reproduzíveis.

**Architecture:** preservar a arquitetura pública existente e a fronteira editorial, corrigindo gaps de produção sem reabrir o design do DevOS. A entrega pública continua em TanStack Start; conteúdo editorial continua vindo apenas de projeções aprovadas. O alvo de hospedagem continua Cloudflare, mas a auditoria separa claramente prontidão do front público de paridade do DevOS privado.

**Tech Stack:** TypeScript, React 18, TanStack Start/Router, Hono, Vitest, Playwright, pnpm, Cloudflare Workers/D1.

**Spec:** `docs/PUBLIC_PORTFOLIO.md`

## Global Constraints

- Não fabricar dados pessoais, certificados, projetos ou métricas.
- Não enfraquecer a fronteira público/privado.
- Não tornar o portfólio dependente de estado operacional privado.
- Manter `/devos` fora do escopo de redesign; tocar nele apenas se necessário para preservar boundary/build.
- Manter desenvolvimento em `develop/public-portfolio-v1`.
- Gates pesados/checkouts devem usar `Semogtw/Offline-Toolchains` quando necessário.
- Commits devem ser pequenos e frequentes.

---

### Task 1: HTTP semantics for unpublished editorial routes

**Files:**
- Modify: `apps/web/src/routes/projects.$slug.tsx`
- Modify: `apps/web/src/routes/notes.$slug.tsx`
- Modify: `tests/e2e/public-portfolio.spec.ts`

**Interfaces:**
- Consumes: `getPublicProjectRouteFn`, `getPublicEditorialDocumentRouteFn`.
- Produces: real HTTP 404 for unpublished/unknown public project and note slugs while preserving 308 canonical redirects.

- [ ] Add E2E assertions that unknown project/note URLs return HTTP 404.
- [ ] Change loaders to throw TanStack `notFound()` when projection resolution returns `document: null`.
- [ ] Keep route-specific friendly not-found UI without leaking draft/private state.
- [ ] Preserve 308 redirect behavior for known aliases.
- [ ] Run focused E2E gate or record runner limitation.
- [ ] Commit.

### Task 2: Canonical public origin and complete sharing metadata

**Files:**
- Create: `apps/web/src/routes/-public-url.ts`
- Create: `apps/web/src/routes/-public-url.test.ts`
- Modify: `apps/web/src/routes/-public-portfolio-head.ts`
- Modify: `apps/web/src/routes/-public-editorial-head.ts`
- Modify: `apps/web/src/routes/-public-discovery.ts`
- Modify: `apps/web/src/routes/-public-discovery.test.ts`

**Interfaces:**
- Produces: `publicUrl(path, origin?)`, `normalizeConfiguredPublicOrigin(value)`.
- Consumers: portfolio/editorial head helpers and robots/sitemap generation.

- [ ] Add unit tests for HTTPS origins, development fallback, slash normalization and unsafe origin rejection.
- [ ] Centralize absolute public URL creation.
- [ ] Add `og:url` and absolute canonical URLs whenever a configured production origin exists.
- [ ] Keep deterministic relative fallback for local development/tests.
- [ ] Ensure robots/sitemap origin generation cannot emit credentials, path/query/hash contamination or malformed origin.
- [ ] Run focused unit tests or record runner limitation.
- [ ] Commit.

### Task 3: Browser identity, install metadata and baseline document metadata

**Files:**
- Modify: `apps/web/src/routes/__root.tsx`
- Create: `apps/web/src/routes/favicon[.]svg.ts`
- Create: `apps/web/src/routes/site[.]webmanifest.ts`
- Modify: `tests/e2e/public-portfolio.spec.ts`

**Interfaces:**
- Produces: `/favicon.svg` and `/site.webmanifest` with no private data.

- [ ] Add E2E checks for favicon/manifest responses and root metadata.
- [ ] Add `theme-color`, application name, color-scheme and manifest/favicon links.
- [ ] Serve deterministic cacheable favicon SVG from a public route.
- [ ] Serve a minimal web manifest with standalone identity metadata and no fake screenshots/icons.
- [ ] Commit.

### Task 4: Production delivery hardening

**Files:**
- Modify: `scripts/start-web-server.mjs`
- Create: `scripts/check-public-production-readiness.mjs`
- Modify: `package.json`
- Modify: `tests/e2e/public-portfolio.spec.ts`

**Interfaces:**
- Produces: baseline web response security headers and `pnpm check:public-production`.

- [ ] Add E2E assertions for baseline headers on public HTML.
- [ ] Apply `X-Content-Type-Options`, `Referrer-Policy`, `X-Frame-Options`, a restrictive `Permissions-Policy` and no-cache rules for error responses without overriding application-specific cache headers.
- [ ] Add a source/config production-readiness guard that validates required public routes, metadata helpers and build-facing invariants without requiring personal content.
- [ ] Wire the guard into `pnpm check` only if it is deterministic without deployment secrets; otherwise expose it as an explicit release gate.
- [ ] Commit.

### Task 5: Editorial media readiness

**Files:**
- Modify: `apps/web/src/components/public/public-markdown.tsx`
- Modify: `apps/web/src/components/public/public-markdown.test.ts`
- Modify: `apps/web/src/styles/public-editorial.css`

**Interfaces:**
- Produces: safe Markdown image rendering for root-relative and HTTPS sources only.

- [ ] Add tests proving safe images render and unsafe/data/javascript/protocol-relative sources do not.
- [ ] Require non-empty alt text; malformed images degrade to text instead of unsafe markup.
- [ ] Render images with lazy loading and async decoding.
- [ ] Add responsive media framing that cannot overflow the reading column.
- [ ] Commit.

### Task 6: Mobile/accessibility resilience

**Files:**
- Modify: `packages/ui/src/navigation/public-header.tsx`
- Modify: `packages/ui/src/navigation/public-header.test.tsx`
- Modify: `packages/ui/src/styles/global.css`
- Modify: `apps/web/src/styles/public-surfaces.css`
- Modify: `tests/e2e/public-portfolio.spec.ts`

**Interfaces:**
- Produces: robust mobile menu state across route changes, outside interaction and viewport changes.

- [ ] Add tests for closing menu after outside pointer interaction and desktop resize.
- [ ] Preserve Escape/focus-restoration behavior.
- [ ] Ensure `100dvh`/safe-area behavior does not cause mobile clipping.
- [ ] Add intermediate viewport E2E checks for 768/1024 widths and horizontal overflow.
- [ ] Commit.

### Task 7: Cloudflare public-launch contract

**Files:**
- Modify: `DEPLOYMENT.md`
- Modify: `docs/SITE_STATUS.md`
- Modify: `docs/PUBLIC_PORTFOLIO.md`
- Potentially modify: web/Cloudflare adapter files only after verifying current TanStack Start hosting requirements.

**Interfaces:**
- Produces: an explicit public-launch gate that does not claim private DevOS parity.

- [ ] Verify current TanStack Start Cloudflare requirements against current documentation.
- [ ] Record the existing Node/SQLite import boundary as a blocker for a unified web Worker if it remains in the built route graph.
- [ ] Implement any dependency-free adapter/config changes that are safe with the current lockfile.
- [ ] Do not add or guess Cloudflare package versions without lockfile/toolchain verification.
- [ ] Document exact remaining deployment-only steps that require a real Cloudflare account/domain/secrets rather than source changes.
- [ ] Commit.

### Task 8: Full exact-head verification

**Files:**
- Update: `triggers/private-ci.json` in `Semogtw/Offline-Toolchains` on `build/private-ci` when the implementation head is ready.
- Update documentation with the exact verified SHA/result.

**Interfaces:**
- Consumes: final `develop/public-portfolio-v1` SHA.
- Produces: reproducible CI evidence for the exact candidate.

- [ ] Request SemogSite CI for the exact branch/SHA through the public toolchain hub.
- [ ] Inspect full check/build result.
- [ ] If a gate fails because of code, patch and re-run.
- [ ] If a gate is environmental/external, record it precisely and continue with resolvable code.
- [ ] Run/extend public portfolio E2E coverage where the toolchain workflow supports it.
- [ ] Mark docs with the exact latest verified checkpoint.
- [ ] Commit documentation checkpoint.
