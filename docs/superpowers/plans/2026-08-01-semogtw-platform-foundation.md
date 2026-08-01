# Semogtw Platform Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the portable Semogtw public site and protected Semogtw DevOS foundation, using the inspected `pdi-template` selectively while preserving independent domain rules, explicit public DTOs, revocable local authentication, and host portability.

**Architecture:** The web surface uses TanStack Start, TanStack Router, and TanStack Query. Hono exposes the versioned public/private HTTP API and remains the potential MCP bridge entry point, but the Sites assessment does not establish that Sites can host a production MCP endpoint; that surface requires a separate compatibility gate. Domain, contracts, database, auth, and UI live in separate workspace packages; TanStack, Hono, D1, Wrangler, and browser code cannot enter the domain package.

**Tech Stack:** Node.js 22+, pnpm workspaces, TypeScript strict mode, React 18.3+, TanStack Start/Router/Query 1.168.32+, Hono, Zod, Drizzle ORM, SQLite through `better-sqlite3`, Radix primitives selected per feature, Vitest, Playwright, CSS variables, Figma, Supericons.

## Global Constraints

- Product identity is **Semogtw**; the private application is **Semogtw DevOS**.
- UI language is Brazilian Portuguese and presentation timezone is `America/Bahia`.
- The canonical product requirements are specification v2.1 plus the approved foundation design and upstream-reference addendum.
- The inspected upstream commit is `krisnarane/pdi-template@8be932139e913b1ff050b0bf938910abae52a044`.
- No upstream PDI taxonomy, personal names, profile data, images, seeds, gradients, or branding may enter SemogSite.
- `THIRD_PARTY_NOTICES.md` must identify every materially reused upstream file.
- No `LICENSE` file was found in the inspected upstream; provenance and the authorization statement must remain explicit.
- Production hosting is not selected. ChatGPT Sites is now assessed as a candidate primary host for the public/editorial surface and a lightweight D1/R2-backed DevOS; remote MCP, arbitrary API routing, webhooks, background jobs, and final deployment mode remain unverified. D1, Wrangler, Cloudflare, Vercel, Netlify, Supabase, and Sites remain adapters.
- `/devos` and `/api/v1/private/*` must be protected server-side and fail closed without auth configuration.
- Public responses are generated from dedicated allowlist DTOs, never by subtracting private fields.
- No private repository name, branch, blocker, evidence URL, session detail, token, secret, or private summary may appear in anonymous HTML, payloads, metadata, logs, sitemap, robots, or public APIs.
- A completed stage requires `progress = 100`, `done = true`, and valid evidence.
- The initial database contains only explicit demo records marked `source = "seed_demo"`; it is not described as a Notion migration or live GitHub state.
- Mobile acceptance width is 360 px with no horizontal overflow and 44 px minimum interactive targets.
- Commit after every independently testable task and push after each successful commit.

---

## File Map

```text
SemogSite/
├── apps/
│   ├── web/
│   │   ├── src/
│   │   │   ├── routes/
│   │   │   ├── components/
│   │   │   ├── server/
│   │   │   └── styles/
│   │   ├── tests/
│   │   └── vite.config.ts
│   └── api/
│       ├── src/
│       │   ├── middleware/
│       │   ├── routes/
│       │   └── app.ts
│       └── tests/
├── packages/
│   ├── domain/src/
│   ├── contracts/src/
│   ├── database/src/
│   ├── auth/src/
│   ├── ui/src/
│   └── config/src/
├── scripts/
├── docs/
├── tests/e2e/
├── pnpm-workspace.yaml
├── tsconfig.base.json
└── package.json
```

---

### Task 1: Upstream intake guardrails

**Files:**
- Modify: `docs/UPSTREAM_REFERENCE.md`
- Modify: `THIRD_PARTY_NOTICES.md`
- Create: `scripts/check-upstream-clean.mjs`
- Create: `scripts/check-boundaries.mjs`
- Create: `scripts/check-upstream-clean.test.mjs`
- Modify: `package.json`

**Interfaces:**
- Consumes: the inspected upstream matrix and commit pin.
- Produces: `pnpm check:upstream-clean` and `pnpm check:boundaries`.

- [ ] **Step 1: Write the failing guardrail test**

```js
// scripts/check-upstream-clean.test.mjs
import assert from "node:assert/strict";
import { scanText } from "./check-upstream-clean.mjs";

const result = scanText("Julia — Plano de Desenvolvimento Individual");
assert.deepEqual(result, ["Julia", "Plano de Desenvolvimento Individual"]);
```

- [ ] **Step 2: Run the test and verify failure**

Run: `node scripts/check-upstream-clean.test.mjs`  
Expected: FAIL because `check-upstream-clean.mjs` does not exist.

- [ ] **Step 3: Implement the marker scanner and repository command**

```js
// scripts/check-upstream-clean.mjs
export const forbiddenMarkers = [
  "Julia",
  "PDI Julia",
  "Plano de Desenvolvimento Individual",
  "pdi_session",
  "ADMIN_PASSWORD",
];

export function scanText(text) {
  return forbiddenMarkers.filter((marker) => text.includes(marker));
}
```

The executable portion must scan tracked source, migration, public-asset metadata, route metadata, and seed files while excluding `docs/UPSTREAM_REFERENCE.md`, `THIRD_PARTY_NOTICES.md`, and the historical specification documents.

- [ ] **Step 4: Implement the package-boundary checker**

Reject imports in `packages/domain/**` containing:

```text
@tanstack/
hono
drizzle-
better-sqlite3
wrangler
cloudflare:
react
apps/
packages/ui
```

- [ ] **Step 5: Add root commands**

```json
{
  "scripts": {
    "check:upstream-clean": "node scripts/check-upstream-clean.mjs",
    "check:boundaries": "node scripts/check-boundaries.mjs"
  }
}
```

- [ ] **Step 6: Run guardrails**

Run: `node scripts/check-upstream-clean.test.mjs && pnpm check:upstream-clean && pnpm check:boundaries`  
Expected: PASS with zero forbidden implementation markers and zero boundary violations.

- [ ] **Step 7: Commit and push**

```bash
git add docs/UPSTREAM_REFERENCE.md THIRD_PARTY_NOTICES.md scripts package.json
git commit -m "chore: enforce upstream adoption guardrails"
git push
```

---

### Task 2: Bootstrap the portable workspace from the accepted upstream concepts

**Files:**
- Create: `package.json`
- Create: `pnpm-workspace.yaml`
- Create: `tsconfig.base.json`
- Create: `.editorconfig`
- Create: `.gitignore`
- Create: `.env.example`
- Create: `apps/web/package.json`
- Create: `apps/web/vite.config.ts`
- Create: `apps/web/src/router.tsx`
- Create: `apps/web/src/routes/__root.tsx`
- Create: `apps/api/package.json`
- Create: `apps/api/src/app.ts`
- Create: `packages/config/package.json`
- Create: `packages/config/src/index.ts`
- Create: `packages/*/package.json`
- Create: `vitest.workspace.ts`

**Interfaces:**
- Consumes: Task 1 guardrails.
- Produces: buildable workspaces `@semogtw/web`, `@semogtw/api`, `@semogtw/domain`, `@semogtw/contracts`, `@semogtw/database`, `@semogtw/auth`, `@semogtw/ui`, and `@semogtw/config`.

- [ ] **Step 1: Write the failing workspace smoke test**

```ts
// packages/config/src/index.test.ts
import { describe, expect, it } from "vitest";
import { parseRuntimeConfig } from "./index";

describe("parseRuntimeConfig", () => {
  it("fails closed when session configuration is absent", () => {
    expect(() => parseRuntimeConfig({ NODE_ENV: "production" })).toThrow(
      "SEMOGTW_SESSION_SECRET",
    );
  });
});
```

- [ ] **Step 2: Create workspace manifests and install dependencies**

Run:

```bash
pnpm add -Dw typescript vitest @types/node
pnpm --filter @semogtw/web add react@^18.3.1 react-dom@^18.3.1 \
  @tanstack/react-start@^1.168.32 @tanstack/react-router@^1.168.32 \
  @tanstack/react-query@^5 zod
pnpm --filter @semogtw/api add hono zod
```

Install only the Radix primitives selected in Task 7.

- [ ] **Step 3: Implement strict shared TypeScript settings**

```json
{
  "compilerOptions": {
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true,
    "noImplicitOverride": true,
    "noFallthroughCasesInSwitch": true,
    "useUnknownInCatchVariables": true,
    "verbatimModuleSyntax": true,
    "moduleResolution": "Bundler",
    "target": "ES2022"
  }
}
```

- [ ] **Step 4: Implement runtime configuration parsing**

```ts
export type RuntimeConfig = {
  nodeEnv: "development" | "test" | "production";
  sessionSecret: string;
  ownerPasswordHash: string;
  databaseUrl: string;
};

export function parseRuntimeConfig(env: Record<string, string | undefined>): RuntimeConfig;
```

Development may use `.env`, but missing auth values must keep private routes unavailable rather than inventing defaults.

- [ ] **Step 5: Create minimal TanStack and Hono entry points**

The root route must contain document metadata, a sanitized error boundary, 404 handling, Query provider composition, and no private auth lookup. The Hono app must expose only `GET /health` returning `{ ok: true, service: "semogtw-api" }`.

- [ ] **Step 6: Run workspace gates**

Run: `pnpm -r typecheck && pnpm -r test && pnpm -r build && pnpm check:boundaries`  
Expected: all workspaces pass; no framework import exists in `packages/domain`.

- [ ] **Step 7: Record upstream use and commit**

Update `THIRD_PARTY_NOTICES.md` with the adopted concepts from upstream `package.json`, `vite.config.ts`, and `src/routes/__root.tsx`.

```bash
git add .
git commit -m "feat: bootstrap portable TanStack and Hono workspace"
git push
```

---

### Task 3: Define domain entities and stage invariants

**Files:**
- Create: `packages/domain/src/shared/types.ts`
- Create: `packages/domain/src/projects/project.ts`
- Create: `packages/domain/src/roadmap/stage.ts`
- Create: `packages/domain/src/roadmap/stage.test.ts`
- Create: `packages/domain/src/ports/repositories.ts`
- Create: `packages/domain/src/index.ts`

**Interfaces:**
- Produces:
  - `validateStage(stage: StageSnapshot): DomainValidationResult`
  - `ProjectRepository`
  - `StageRepository`
  - `EvidenceRepository`

- [ ] **Step 1: Write failing invariant tests**

```ts
import { describe, expect, it } from "vitest";
import { validateStage } from "./stage";

describe("validateStage", () => {
  it("rejects completion without valid evidence", () => {
    const result = validateStage({
      id: "stage-1",
      projectId: "project-1",
      title: "Validar fundação",
      state: "completed",
      progress: 100,
      done: true,
      nextStep: null,
      blocker: null,
      evidence: [],
      manualLock: false,
      updatedAt: "2026-08-01T00:00:00.000Z",
    });

    expect(result).toEqual({
      ok: false,
      errors: ["EVIDENCE_REQUIRED"],
    });
  });

  it("rejects blocked stages without a blocker and unlock action", () => {
    const result = validateStage({
      id: "stage-2",
      projectId: "project-1",
      title: "Publicar",
      state: "blocked",
      progress: 40,
      done: false,
      nextStep: "",
      blocker: "",
      evidence: [],
      manualLock: false,
      updatedAt: "2026-08-01T00:00:00.000Z",
    });

    expect(result.ok).toBe(false);
    expect(result.errors).toEqual(["BLOCKER_REQUIRED", "NEXT_STEP_REQUIRED"]);
  });
});
```

- [ ] **Step 2: Run and verify failure**

Run: `pnpm --filter @semogtw/domain test -- stage.test.ts`  
Expected: FAIL because stage types and validation do not exist.

- [ ] **Step 3: Implement exact domain types**

```ts
export type StageState = "backlog" | "next" | "in_progress" | "blocked" | "completed";
export type EvidenceStatus = "observed" | "passed" | "failed" | "pending" | "superseded";

export type StageEvidence = {
  id: string;
  status: EvidenceStatus;
};

export type StageSnapshot = {
  id: string;
  projectId: string;
  title: string;
  state: StageState;
  progress: number;
  done: boolean;
  nextStep: string | null;
  blocker: string | null;
  evidence: readonly StageEvidence[];
  manualLock: boolean;
  updatedAt: string;
};
```

- [ ] **Step 4: Implement invariant validation**

Valid evidence is evidence whose status is `observed` or `passed`. Completion requires at least one valid item; `progress = 100`; and `done = true`. Every non-completed stage requires a trimmed `nextStep`.

- [ ] **Step 5: Define repository ports**

```ts
export interface ProjectRepository {
  listActive(): Promise<readonly ProjectSnapshot[]>;
  findBySlug(slug: string): Promise<ProjectSnapshot | null>;
}

export interface StageRepository {
  listForProject(projectId: string): Promise<readonly StageSnapshot[]>;
  listCurrent(): Promise<readonly StageSnapshot[]>;
}
```

- [ ] **Step 6: Run tests and boundary checks**

Run: `pnpm --filter @semogtw/domain test && pnpm check:boundaries`  
Expected: PASS.

- [ ] **Step 7: Commit and push**

```bash
git add packages/domain
git commit -m "feat(domain): enforce roadmap evidence invariants"
git push
```

---

### Task 4: Create explicit public and private contracts

**Files:**
- Create: `packages/contracts/src/public/project.ts`
- Create: `packages/contracts/src/public/project.test.ts`
- Create: `packages/contracts/src/private/project.ts`
- Create: `packages/contracts/src/common/enums.ts`
- Create: `packages/contracts/src/index.ts`

**Interfaces:**
- Produces:
  - `PublicProjectSchema`
  - `toPublicProjectDto(source: PublishableProjectSource): PublicProjectDto`
  - `PrivateProjectSchema`

- [ ] **Step 1: Write a failing leak-prevention test**

```ts
import { describe, expect, it } from "vitest";
import { toPublicProjectDto } from "./project";

describe("toPublicProjectDto", () => {
  it("does not serialize private repository or operational fields", () => {
    const dto = toPublicProjectDto({
      slug: "offline-toolchains",
      name: "Offline Toolchains",
      visibility: "public",
      publicSummary: "Toolchains reproduzíveis para ambientes offline.",
      publicProgress: 45,
      featured: true,
      liveUrl: null,
      documentationUrl: "https://example.invalid/public-docs",
      lastPublicActivityAt: "2026-08-01T00:00:00.000Z",
      privateSummary: "PRIVATE_MARKER",
      branchSummary: "secret/internal",
      repositoryFullNames: ["Semogtw/private-repo"],
      blockers: ["PRIVATE_BLOCKER"],
    });

    expect(JSON.stringify(dto)).not.toContain("PRIVATE_");
    expect(JSON.stringify(dto)).not.toContain("private-repo");
    expect(JSON.stringify(dto)).not.toContain("secret/internal");
  });
});
```

- [ ] **Step 2: Run and verify failure**

Run: `pnpm --filter @semogtw/contracts test -- project.test.ts`  
Expected: FAIL because the serializer does not exist.

- [ ] **Step 3: Implement the allowlist source and DTO**

```ts
export type PublicProjectDto = {
  slug: string;
  name: string;
  publicSummary: string;
  publicProgress: number | null;
  featured: boolean;
  liveUrl: string | null;
  documentationUrl: string | null;
  lastPublicActivityAt: string | null;
};
```

The serializer must construct a new object field by field. It may not use object spread, `omit`, deletion, or a private entity cast.

- [ ] **Step 4: Add visibility validation**

`private` sources throw `PUBLICATION_NOT_ALLOWED`. `unlisted` sources may be fetched by exact slug but are not returned by list/sitemap contracts.

- [ ] **Step 5: Add contract snapshots for known private markers**

Include markers for repository names, branches, blocker text, session details, audit IDs, evidence links, `.env`, and token-like strings.

- [ ] **Step 6: Run tests**

Run: `pnpm --filter @semogtw/contracts test`  
Expected: PASS.

- [ ] **Step 7: Commit and push**

```bash
git add packages/contracts
git commit -m "feat(contracts): isolate public project DTOs"
git push
```

---

### Task 5: Implement the relational schema and local repositories

**Files:**
- Create: `packages/database/src/schema/projects.ts`
- Create: `packages/database/src/schema/roadmap.ts`
- Create: `packages/database/src/schema/operations.ts`
- Create: `packages/database/src/schema/content.ts`
- Create: `packages/database/src/schema/auth.ts`
- Create: `packages/database/src/schema/audit.ts`
- Create: `packages/database/src/schema/index.ts`
- Create: `packages/database/src/adapters/sqlite.ts`
- Create: `packages/database/src/repositories/project-repository.ts`
- Create: `packages/database/src/repositories/stage-repository.ts`
- Create: `packages/database/src/repositories/repository-contract.test.ts`
- Create: `packages/database/migrations/0001_foundation.sql`
- Create: `packages/database/migrations/0002_seed_demo.sql`

**Interfaces:**
- Consumes: repository ports from Task 3.
- Produces: `createSqliteDatabase(path: string)`, `SqliteProjectRepository`, and `SqliteStageRepository`.

- [ ] **Step 1: Write the failing repository contract test**

```ts
it("round-trips a project without losing visibility or source metadata", async () => {
  const db = createSqliteDatabase(":memory:");
  await migrate(db);
  const repository = new SqliteProjectRepository(db);

  await repository.insert(seedProject);
  await expect(repository.findBySlug(seedProject.slug)).resolves.toMatchObject({
    slug: seedProject.slug,
    visibility: "private",
    dataSource: "seed_demo",
  });
});
```

- [ ] **Step 2: Run and verify failure**

Run: `pnpm --filter @semogtw/database test -- repository-contract.test.ts`  
Expected: FAIL because schema and repository implementations do not exist.

- [ ] **Step 3: Define all canonical foundation tables**

The migration must create:

```text
projects
repositories
workstreams
stages
attention_items
development_sessions
evidence
publications
timeline_entries
media_assets
sync_runs
audit_events
app_settings
owner_accounts
auth_sessions
```

Use UTC ISO text columns, explicit enum checks where SQLite supports them, foreign keys, unique slugs/full names, and indexes for active projects, stage state, attention status, publication visibility, and session token digest.

- [ ] **Step 4: Implement local SQLite composition**

`createSqliteDatabase` enables foreign keys, busy timeout, and WAL for file-backed databases. Tests use `:memory:`.

- [ ] **Step 5: Create demo seed data**

Demo records must include `data_source = "seed_demo"` and fictional public summaries. Do not seed private GitHub URLs, branches, or claims copied from the Notion snapshot.

- [ ] **Step 6: Run repository and migration tests**

Run: `pnpm --filter @semogtw/database test`  
Expected: PASS including a second migration run that makes no destructive changes.

- [ ] **Step 7: Update provenance and commit**

Record that upstream migration numbering conventions influenced the layout but no schema/seed content was reused.

```bash
git add packages/database THIRD_PARTY_NOTICES.md
git commit -m "feat(database): add portable foundation schema"
git push
```

---

### Task 6: Implement revocable local authentication

**Files:**
- Create: `packages/auth/src/provider.ts`
- Create: `packages/auth/src/password.ts`
- Create: `packages/auth/src/session.ts`
- Create: `packages/auth/src/local-provider.ts`
- Create: `packages/auth/src/local-provider.test.ts`
- Create: `packages/auth/src/index.ts`
- Create: `scripts/hash-owner-password.mjs`
- Create: `apps/web/src/server/auth.ts`
- Create: `apps/api/src/middleware/auth.ts`

**Interfaces:**
- Produces:
  - `AuthProvider`
  - `LocalAuthProvider`
  - `hashOwnerPassword(password: string): Promise<string>`
  - `verifyOwnerPassword(password: string, encodedHash: string): Promise<boolean>`

```ts
export interface AuthProvider {
  authenticate(credentials: OwnerCredentials): Promise<AuthResult>;
  resolveSession(rawToken: string): Promise<AuthenticatedOwner | null>;
  revokeSession(sessionId: string): Promise<void>;
}
```

- [ ] **Step 1: Write failing session tests**

```ts
it("stores only the token digest and supports revocation", async () => {
  const { provider, sessions } = createAuthFixture();
  const result = await provider.authenticate({ password: "correct horse battery staple" });

  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error("expected success");

  expect(sessions.rows[0]?.tokenDigest).not.toContain(result.rawToken);
  await provider.revokeSession(result.session.id);
  await expect(provider.resolveSession(result.rawToken)).resolves.toBeNull();
});
```

- [ ] **Step 2: Run and verify failure**

Run: `pnpm --filter @semogtw/auth test`  
Expected: FAIL because the provider is absent.

- [ ] **Step 3: Implement password hashing**

Use Node `crypto.scrypt` with a random 16-byte salt and encoded parameters. The script prompts without echo, outputs only the encoded hash, and never writes a password to disk.

- [ ] **Step 4: Implement sessions**

Generate `randomBytes(32)`, return the raw token once, persist `sha256(rawToken)` with owner ID, created time, absolute expiry, last-seen time, and optional revoked time.

- [ ] **Step 5: Implement web and API enforcement**

Cookie properties:

```ts
{
  httpOnly: true,
  sameSite: "lax",
  secure: runtime.nodeEnv === "production",
  path: "/",
  maxAge: 60 * 60 * 24 * 14
}
```

Private mutations require a matching CSRF cookie/header token. Login uses generic failure text and an IP/session-keyed rate limiter.

- [ ] **Step 6: Add fail-closed tests**

Missing password hash, session secret, database, malformed token, expired token, revoked token, and CSRF mismatch must all deny access without exposing configuration details.

- [ ] **Step 7: Run tests**

Run: `pnpm --filter @semogtw/auth test && pnpm --filter @semogtw/api test && pnpm --filter @semogtw/web test`  
Expected: PASS.

- [ ] **Step 8: Update upstream notice and commit**

Document that secure-cookie and timing-resistant comparison concepts were adapted from `src/api/auth.ts`, while the session model was rewritten.

```bash
git add packages/auth apps scripts THIRD_PARTY_NOTICES.md
git commit -m "feat(auth): add revocable owner sessions"
git push
```

---

### Task 7: Build the Semogtw design system and visual reference set

**Files:**
- Create: `packages/ui/src/styles/tokens.css`
- Create: `packages/ui/src/styles/global.css`
- Create: `packages/ui/src/primitives/button.tsx`
- Create: `packages/ui/src/primitives/surface.tsx`
- Create: `packages/ui/src/primitives/status.tsx`
- Create: `packages/ui/src/primitives/empty-state.tsx`
- Create: `packages/ui/src/primitives/error-state.tsx`
- Create: `packages/ui/src/navigation/public-header.tsx`
- Create: `packages/ui/src/navigation/devos-sidebar.tsx`
- Create: `packages/ui/src/navigation/devos-bottom-nav.tsx`
- Create: `packages/ui/src/icons/index.tsx`
- Create: `packages/ui/src/primitives/primitives.test.tsx`
- Create: `docs/DESIGN_SYSTEM.md`
- Create: `docs/design/FIGMA_REFERENCE.md`

**Interfaces:**
- Produces reusable public and DevOS components with no data access.
- Uses SVG icons selected through Supericons and committed as React components or sanitized SVG assets.

- [ ] **Step 1: Create Figma frames and document them**

Create pages and frames named exactly:

```text
Foundations / Color
Foundations / Type
Foundations / Spacing
Components / Public
Components / DevOS
Public / Home / 390
Public / Home / 1440
DevOS / Overview / 390
DevOS / Overview / 1440
DevOS / Today / 390
DevOS / Projects / 1440
DevOS / Roadmap / 390
```

Record the Figma file URL, frame names, and review date in `docs/design/FIGMA_REFERENCE.md`.

- [ ] **Step 2: Select one coherent SVG family**

Select icons for: Home, Today, Projects, Roadmap, Operations, More, Search, Capture, Settings, Evidence, GitHub, Sync, Warning, Success, Blocked, External link. Record source library and exact icon names in `docs/DESIGN_SYSTEM.md`.

- [ ] **Step 3: Write failing accessibility tests**

```tsx
it("exposes status through text and icon semantics, not color alone", () => {
  render(<Status tone="warning">Atenção</Status>);
  expect(screen.getByText("Atenção")).toBeVisible();
  expect(screen.getByRole("img", { name: "Status de atenção" })).toBeVisible();
});
```

- [ ] **Step 4: Implement tokens**

Use the approved dark tokens, 4 px spacing base, 10–14 px radii, visible focus, tabular numerals, reduced-motion rules, compact/medium/wide breakpoints, and 44 px touch targets.

- [ ] **Step 5: Rebuild upstream visual patterns**

Use the upstream Navbar and Hero only as behavior/composition references. Do not import `GradientCard`; implement neutral `Surface` and editorial layout primitives.

- [ ] **Step 6: Run component tests**

Run: `pnpm --filter @semogtw/ui test`  
Expected: PASS for keyboard focus, labels, status semantics, and reduced-motion classes.

- [ ] **Step 7: Update notices and commit**

```bash
git add packages/ui docs THIRD_PARTY_NOTICES.md
git commit -m "feat(ui): establish Semogtw design system"
git push
```

---

### Task 8: Implement the public shell, home, and safe secondary routes

**Files:**
- Create: `apps/web/src/routes/_public.tsx`
- Create: `apps/web/src/routes/_public.index.tsx`
- Create: `apps/web/src/routes/_public.about.tsx`
- Create: `apps/web/src/routes/_public.projects.index.tsx`
- Create: `apps/web/src/routes/_public.projects.$slug.tsx`
- Create: `apps/web/src/routes/_public.journey.tsx`
- Create: `apps/web/src/routes/_public.lab.tsx`
- Create: `apps/web/src/routes/_public.notes.index.tsx`
- Create: `apps/web/src/routes/_public.stack.tsx`
- Create: `apps/web/src/routes/_public.contact.tsx`
- Create: `apps/web/src/components/public/home-sections.tsx`
- Create: `apps/web/src/server/public-projects.ts`
- Create: `apps/web/tests/public-routes.test.tsx`

**Interfaces:**
- Consumes: public DTOs and public UI components.
- Produces: public HTML routes with route-specific metadata.

- [ ] **Step 1: Write failing anonymous-route tests**

```ts
it.each(["/", "/about", "/projects", "/journey", "/lab", "/notes", "/stack", "/contact"])(
  "%s renders without an owner session",
  async (path) => {
    const response = await renderRoute(path, { session: null });
    expect(response.status).toBe(200);
    expect(response.html).toContain("Semogtw");
    expect(response.html).not.toContain("PRIVATE_MARKER");
  },
);
```

- [ ] **Step 2: Run and verify failure**

Run: `pnpm --filter @semogtw/web test -- public-routes.test.tsx`  
Expected: FAIL because public routes are absent.

- [ ] **Step 3: Implement the public shell**

Use `PublicHeader`, semantic `<main>`, editorial footer, skip link, per-route title/description, canonical placeholder derived only from configured public base URL, and a useful 404.

- [ ] **Step 4: Implement the home**

Sections:

```text
Semogtw editorial hero
explicitly public current activity
featured public projects
principles and areas of interest
recent approved publications
laboratory entry
contact and public links
```

If no project or publication is approved, show intentional empty copy rather than demo claims.

- [ ] **Step 5: Implement safe secondary structures**

Secondary pages contain meaningful headings, descriptions, empty states, and extension points without claiming finished content.

- [ ] **Step 6: Add metadata leak assertions**

Inspect rendered HTML, route payload, Open Graph tags, structured data, sitemap candidates, and navigation links for private markers.

- [ ] **Step 7: Run tests and commit**

```bash
pnpm --filter @semogtw/web test
pnpm check:upstream-clean
git add apps/web
git commit -m "feat(web): add safe editorial public surface"
git push
```

---

### Task 9: Implement the protected DevOS shell and login route

**Files:**
- Create: `apps/web/src/routes/devos.login.tsx`
- Create: `apps/web/src/routes/devos.tsx`
- Create: `apps/web/src/components/devos/devos-shell.tsx`
- Create: `apps/web/src/server/require-owner.ts`
- Create: `apps/web/tests/devos-auth.test.tsx`

**Interfaces:**
- Consumes: `AuthProvider`.
- Produces: `requireOwner(request): Promise<AuthenticatedOwner>` and protected DevOS layout context.

- [ ] **Step 1: Write failing protection tests**

```ts
it("redirects anonymous DevOS access before loading private data", async () => {
  const result = await loadRoute("/devos", { session: null });
  expect(result.status).toBe(302);
  expect(result.headers.location).toBe("/devos/login?returnTo=%2Fdevos");
  expect(privateRepositoryCalls()).toBe(0);
});
```

- [ ] **Step 2: Run and verify failure**

Run: `pnpm --filter @semogtw/web test -- devos-auth.test.tsx`  
Expected: FAIL.

- [ ] **Step 3: Implement login**

Use labeled password input, `autocomplete="current-password"`, generic error copy, pending state, CSRF token, safe internal `returnTo`, and no owner name in source or metadata.

- [ ] **Step 4: Implement protected layout**

Authorization runs before private loaders. Desktop uses `DevOSSidebar`; compact screens use `DevOSBottomNav` with Hoje, Projetos, Roadmap, Operação, and Mais.

- [ ] **Step 5: Verify anonymous source isolation**

The login HTML may contain only auth UI and public Semogtw branding. It must not contain project counts, repository names, routes generated from private records, or sync state.

- [ ] **Step 6: Run tests and commit**

```bash
pnpm --filter @semogtw/web test -- devos-auth.test.tsx
git add apps/web
git commit -m "feat(devos): protect private shell server-side"
git push
```

---

### Task 10: Implement Overview and Today application services

**Files:**
- Create: `packages/domain/src/overview/overview-service.ts`
- Create: `packages/domain/src/overview/overview-service.test.ts`
- Create: `packages/domain/src/today/today-service.ts`
- Create: `packages/domain/src/today/today-service.test.ts`
- Create: `apps/web/src/routes/devos.index.tsx`
- Create: `apps/web/src/routes/devos.today.tsx`
- Create: `apps/web/src/components/devos/overview.tsx`
- Create: `apps/web/src/components/devos/today-queue.tsx`

**Interfaces:**
- Produces:
  - `OverviewService.getOverview(): Promise<DevOSOverview>`
  - `TodayService.getQueue(): Promise<TodayQueue>`

- [ ] **Step 1: Write queue-ordering tests**

```ts
it("orders current work by project priority, partial blockage, stage order, and activity", async () => {
  const queue = await service.getQueue();
  expect(queue.executeNow.map((item) => item.stageId)).toEqual([
    "critical-partially-blocked",
    "critical-active",
    "high-active",
  ]);
});
```

- [ ] **Step 2: Run and verify failure**

Run: `pnpm --filter @semogtw/domain test -- today-service.test.ts`  
Expected: FAIL.

- [ ] **Step 3: Implement deterministic sorting**

Priority order is `critical`, `high`, `medium`, `low`; partial blockage precedes unblocked work at equal priority; lower `orderIndex` precedes higher; newest activity breaks the final tie.

- [ ] **Step 4: Implement Overview**

Return active project count, in-progress stage count, unresolved high-impact attention count, persisted sync age, at most two current stages per project, project cards, and attention items.

- [ ] **Step 5: Render routes**

Overview and Today use server-loaded private DTOs, responsive cards rather than mandatory tables, textual data age, safe empty/error states, and no live-sync claims.

- [ ] **Step 6: Run tests and commit**

```bash
pnpm --filter @semogtw/domain test
pnpm --filter @semogtw/web test
git add packages/domain apps/web
git commit -m "feat(devos): add overview and today queue"
git push
```

---

### Task 11: Implement Projects, project hub, and agent context

**Files:**
- Create: `packages/domain/src/projects/project-service.ts`
- Create: `packages/domain/src/projects/project-service.test.ts`
- Create: `packages/domain/src/projects/agent-context.ts`
- Create: `packages/domain/src/projects/agent-context.test.ts`
- Create: `apps/web/src/routes/devos.projects.index.tsx`
- Create: `apps/web/src/routes/devos.projects.$slug.tsx`
- Create: `apps/web/src/components/devos/project-card.tsx`
- Create: `apps/web/src/components/devos/project-hub.tsx`

**Interfaces:**
- Produces:
  - `ProjectService.listOperationalPortfolio()`
  - `ProjectService.getProjectHub(slug: string)`
  - `buildAgentContext(input: AgentContextInput): string`

- [ ] **Step 1: Write the context-output test**

```ts
it("creates a compact timestamped context without secrets or full code", () => {
  const context = buildAgentContext(fixture);
  expect(context).toContain("Branch registrada:");
  expect(context).toContain("Próximo passo:");
  expect(context).toContain("Informação atualizada em:");
  expect(context).not.toContain("ghp_");
  expect(context).not.toContain("PRIVATE_SOURCE_CODE");
});
```

- [ ] **Step 2: Run and verify failure**

Run: `pnpm --filter @semogtw/domain test -- agent-context.test.ts`  
Expected: FAIL.

- [ ] **Step 3: Implement portfolio and hub services**

Separate active projects, active repositories, and the collapsed complete catalog. The hub returns focus, next gate, repositories, current stages, attention, evidence, session history, data age, source, and confidence.

- [ ] **Step 4: Implement agent context**

Include purpose, recorded branch, current state, active stages, next actions, blockers, tests passed/not run, essential links allowed for the owner, safety constraints, timestamp, and confidence. Cap output length and never include source code or tokens.

- [ ] **Step 5: Render responsive pages**

Desktop may use compact comparison rows; 360 px uses cards and disclosures. “Copiar contexto” uses the generated persisted context and provides accessible confirmation.

- [ ] **Step 6: Run tests and commit**

```bash
pnpm --filter @semogtw/domain test
pnpm --filter @semogtw/web test
git add packages/domain apps/web
git commit -m "feat(devos): add project portfolio and hubs"
git push
```

---

### Task 12: Implement read-only Roadmap views

**Files:**
- Create: `packages/domain/src/roadmap/roadmap-service.ts`
- Create: `packages/domain/src/roadmap/roadmap-service.test.ts`
- Create: `apps/web/src/routes/devos.roadmap.tsx`
- Create: `apps/web/src/components/devos/roadmap-list.tsx`
- Create: `apps/web/src/components/devos/roadmap-board.tsx`
- Create: `apps/web/src/components/devos/roadmap-filters.tsx`

**Interfaces:**
- Produces: `RoadmapService.query(filters: RoadmapFilters): Promise<RoadmapResult>`.

- [ ] **Step 1: Write failing filter tests**

```ts
it("combines project, state, and area filters without changing persisted order", async () => {
  const result = await service.query({
    projectIds: ["project-1"],
    states: ["in_progress", "blocked"],
    areas: ["implementation"],
    includeCompleted: false,
  });

  expect(result.items.map((item) => item.id)).toEqual(["stage-2", "stage-5"]);
});
```

- [ ] **Step 2: Run and verify failure**

Run: `pnpm --filter @semogtw/domain test -- roadmap-service.test.ts`  
Expected: FAIL.

- [ ] **Step 3: Implement query service**

Return list and board groupings from the same filtered source. Do not create separate metric tables or client-only business rules.

- [ ] **Step 4: Implement list and board**

List mode is default. Board groups backlog, next, in progress, blocked, and completed. Mobile converts columns into ordered collapsible sections without horizontal board scrolling.

- [ ] **Step 5: Keep mutations disabled**

No state-changing control is rendered in this foundation. Explain read-only status in UI; mutation work belongs to the operation/writing plan after audit paths are implemented.

- [ ] **Step 6: Run tests and commit**

```bash
pnpm --filter @semogtw/domain test
pnpm --filter @semogtw/web test
git add packages/domain apps/web
git commit -m "feat(devos): add read-only roadmap views"
git push
```

---

### Task 13: Expose the Hono public/private API partition

**Files:**
- Create: `apps/api/src/middleware/request-context.ts`
- Create: `apps/api/src/middleware/error-handler.ts`
- Create: `apps/api/src/routes/public/projects.ts`
- Create: `apps/api/src/routes/private/overview.ts`
- Create: `apps/api/src/routes/private/projects.ts`
- Create: `apps/api/src/routes/private/roadmap.ts`
- Modify: `apps/api/src/app.ts`
- Create: `apps/api/tests/api-isolation.test.ts`

**Interfaces:**
- Produces:
  - `GET /api/v1/public/projects`
  - `GET /api/v1/public/projects/:slug`
  - `GET /api/v1/private/overview`
  - `GET /api/v1/private/projects`
  - `GET /api/v1/private/projects/:slug`
  - `GET /api/v1/private/projects/:slug/context`
  - `GET /api/v1/private/roadmap`

- [ ] **Step 1: Write failing isolation tests**

```ts
it("never returns private fields from public project routes", async () => {
  const response = await app.request("/api/v1/public/projects");
  const text = await response.text();

  expect(response.status).toBe(200);
  expect(text).not.toContain("branchSummary");
  expect(text).not.toContain("privateSummary");
  expect(text).not.toContain("repositoryFullNames");
});

it("rejects private routes before invoking services", async () => {
  const response = await app.request("/api/v1/private/overview");
  expect(response.status).toBe(401);
  expect(privateServiceCalls()).toBe(0);
});
```

- [ ] **Step 2: Run and verify failure**

Run: `pnpm --filter @semogtw/api test -- api-isolation.test.ts`  
Expected: FAIL.

- [ ] **Step 3: Implement request context**

Generate a correlation ID, resolve the owner only for private routes, attach sanitized logger fields, and never log request bodies, cookies, tokens, or full external URLs.

- [ ] **Step 4: Implement routes through application services**

Public routes call only public serializers. Private routes require auth middleware and return private contracts. Hono handlers contain no SQL or domain transitions.

- [ ] **Step 5: Implement sanitized errors**

Return:

```json
{
  "ok": false,
  "error": {
    "code": "UNAUTHORIZED",
    "message": "Acesso não autorizado.",
    "recoverable": true
  },
  "correlationId": "..."
}
```

No stack trace is sent to clients.

- [ ] **Step 6: Run tests and commit**

```bash
pnpm --filter @semogtw/api test
pnpm check:boundaries
git add apps/api
git commit -m "feat(api): separate public and private endpoints"
git push
```

---

### Task 14: Add demo seed integrity and confidential-data preflight

**Files:**
- Create: `scripts/preflight-confidentiality.mjs`
- Create: `scripts/preflight-confidentiality.test.mjs`
- Create: `packages/database/src/seed/validate-seed.ts`
- Create: `packages/database/src/seed/validate-seed.test.ts`
- Modify: `package.json`

**Interfaces:**
- Produces: `pnpm preflight:confidentiality`.

- [ ] **Step 1: Write failing detection tests**

```js
assert.equal(scanArtifact('<meta content="Semogtw/private-repo">').ok, false);
assert.equal(scanArtifact('ghp_123456789012345678901234567890123456').ok, false);
assert.equal(scanArtifact('public project summary').ok, true);
```

- [ ] **Step 2: Run and verify failure**

Run: `node scripts/preflight-confidentiality.test.mjs`  
Expected: FAIL.

- [ ] **Step 3: Implement scanner categories**

Detect token patterns, `.env` keys, private repository allowlist entries, internal branch markers, private URLs, upstream personal markers, `PRIVATE_MARKER`, and unsafe serialized field names.

- [ ] **Step 4: Validate demo seed**

Every row must be `seed_demo`; every public row must pass public DTO serialization; no public row may reference a private repository or internal URL.

- [ ] **Step 5: Integrate with build verification**

```json
{
  "scripts": {
    "verify": "pnpm -r typecheck && pnpm -r test && pnpm -r build && pnpm check:boundaries && pnpm check:upstream-clean && pnpm preflight:confidentiality"
  }
}
```

- [ ] **Step 6: Run and commit**

```bash
pnpm verify
git add scripts packages/database package.json
git commit -m "test: add confidentiality preflight"
git push
```

---

### Task 15: Add E2E, mobile, accessibility, and anonymous-source checks

**Files:**
- Create: `playwright.config.ts`
- Create: `tests/e2e/public-anonymous.spec.ts`
- Create: `tests/e2e/devos-auth.spec.ts`
- Create: `tests/e2e/devos-mobile.spec.ts`
- Create: `tests/e2e/keyboard-accessibility.spec.ts`
- Create: `tests/e2e/metadata-sitemap.spec.ts`
- Create: `apps/web/src/routes/sitemap[.]xml.ts`
- Create: `apps/web/src/routes/robots[.]txt.ts`

**Interfaces:**
- Consumes: fully composed web/API application.
- Produces: browser evidence for public/private isolation and responsive behavior.

- [ ] **Step 1: Write anonymous visitor E2E**

Test all public routes, attempt `/devos`, request private APIs, inspect HTML and hydration payload, and assert that configured private markers are absent.

- [ ] **Step 2: Write authenticated route E2E**

Create a test owner and session through test-only fixture setup, open Overview, Today, Projects, a project hub, and Roadmap, then verify logout revokes the session.

- [ ] **Step 3: Write 360 × 800 mobile E2E**

Assert:

```text
no horizontal overflow
bottom navigation visible
content not hidden behind navigation
44 px touch targets
roadmap converted to stacked sections
forms usable without zoom
```

- [ ] **Step 4: Write keyboard and reduced-motion E2E**

Tab through header, skip link, login, bottom navigation, filters, project context action, and roadmap disclosures. Verify visible focus and no keyboard trap.

- [ ] **Step 5: Implement sitemap and robots**

Sitemap includes only `public` routes and published content. Unlisted and private records are absent. Robots never enumerate `/devos` internals.

- [ ] **Step 6: Run browser gates**

Run: `pnpm playwright test`  
Expected: all public, authenticated, mobile, metadata, and accessibility flows pass.

- [ ] **Step 7: Commit and push**

```bash
git add playwright.config.ts tests apps/web/src/routes
git commit -m "test(e2e): verify privacy mobile and accessibility"
git push
```

---

### Task 16: Complete foundation documentation and evidence handoff

**Files:**
- Create: `README.md`
- Create: `ARCHITECTURE.md`
- Create: `DATA_MODEL.md`
- Create: `PUBLIC_SITE.md`
- Create: `FRONTEND_TOOLING.md`
- Create: `SECURITY.md`
- Create: `MIGRATION.md`
- Create: `DEPLOYMENT.md`
- Create: `TESTING.md`
- Create: `MCP.md`
- Create: `CONTENT_WORKFLOW.md`
- Create: `GITHUB_SYNC.md`
- Create: `RUNBOOK.md`
- Create: `CHANGELOG.md`
- Modify: `docs/UPSTREAM_REFERENCE.md`
- Modify: `THIRD_PARTY_NOTICES.md`

**Interfaces:**
- Produces a complete foundation handoff and explicit boundaries for later plans.

- [ ] **Step 1: Document actual architecture**

`ARCHITECTURE.md` must state:

```text
Execution baseline: local Node
Web: TanStack Start
API: Hono
Database: local SQLite adapter
Production host: not selected
Deployment mode A/B/C: pending host verification
MCP: contract reserved, not implemented
Webhooks/background jobs: not implemented
```

- [ ] **Step 2: Document commands and test evidence**

`TESTING.md` lists every command executed and the latest result. Do not mark Playwright, accessibility, security, or build gates as passed unless output was observed.

- [ ] **Step 3: Document security and rotation**

Explain password-hash generation, session-secret generation, cookie policy, revocation, CSRF, fail-closed configuration, private-data classification, log redaction, and anonymous preflight.

- [ ] **Step 4: Document deferred phases**

Create explicit next-plan boundaries:

```text
Plan 2: Notion migration and parity validation
Plan 3: operational writes, evidence, audit and backup
Plan 4: GitHub read-only synchronization and branch recommendations
Plan 5: MCP resources, read tools and safe writes
Plan 6: editorial workflow, publication preview and approval
Plan 7: scheduled reconciliation, webhooks and insights
Plan 8: host verification, deployment mode and controlled publication
```

- [ ] **Step 5: Run full verification**

Run:

```bash
pnpm verify
pnpm playwright test
git grep -n -E 'Julia|PDI Julia|pdi_session|ADMIN_PASSWORD' -- \
  ':!docs/UPSTREAM_REFERENCE.md' \
  ':!THIRD_PARTY_NOTICES.md' \
  ':!docs/superpowers/specs/*'
```

Expected: all commands pass and grep produces no implementation matches.

- [ ] **Step 6: Record the handoff**

Append to `CHANGELOG.md`:

```text
Version:
Deployment mode: pending host verification
Changes implemented:
Schema/migrations:
Tests executed:
Mobile/desktop review:
Accessibility/SEO:
Public content:
Deployment performed: no
MCP tested: no
Upstream commit and adopted modules:
Secrets/configuration pending:
Real blockers:
Exact next step:
```

Populate every field with observed facts.

- [ ] **Step 7: Commit and push**

```bash
git add README.md ARCHITECTURE.md DATA_MODEL.md PUBLIC_SITE.md \
  FRONTEND_TOOLING.md SECURITY.md MIGRATION.md DEPLOYMENT.md TESTING.md \
  MCP.md CONTENT_WORKFLOW.md GITHUB_SYNC.md RUNBOOK.md CHANGELOG.md \
  docs/UPSTREAM_REFERENCE.md THIRD_PARTY_NOTICES.md
git commit -m "docs: complete foundation evidence and handoff"
git push
```

---

## Plan Self-Review

### Specification coverage

- Upstream inspection, commit pin, matrix, provenance and selective reuse: Tasks 1, 2, 7 and 16.
- Portable strict TypeScript architecture: Tasks 2 and 3.
- Explicit domain invariants and evidence-based completion: Task 3.
- Public/private DTO isolation: Tasks 4, 8, 13, 14 and 15.
- Local provisional authentication behind `AuthProvider`: Task 6.
- Relational canonical model and demo-only seed: Task 5.
- Semogtw identity and non-template design system: Task 7.
- Public home and required route structures: Task 8.
- Protected DevOS shell, Overview, Today, Projects, hub and Roadmap: Tasks 9–12.
- Versioned API shared with future MCP: Task 13.
- Mobile, accessibility, SEO and confidentiality gates: Tasks 14 and 15.
- Required documentation and evidence handoff: Task 16.
- Migration, writes, GitHub sync, MCP, editorial workflow, automation and deployment remain explicitly separated into later implementation plans.

### Type consistency

- `AuthProvider` signature is unchanged from the approved design.
- Domain repository ports are defined before database implementations.
- Public DTOs are defined before public routes and APIs.
- Overview, Today, Projects and Roadmap services are defined before web and API consumers.
- TanStack and Hono remain composition layers and do not enter domain interfaces.

### No-placeholder scan

This plan contains no placeholder markers, no unspecified error-handling step, and no instruction to mark a gate passed without observed evidence.