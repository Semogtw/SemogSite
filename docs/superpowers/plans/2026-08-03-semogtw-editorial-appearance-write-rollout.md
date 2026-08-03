# Semogtw Editorial and Appearance Write Rollout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make editorial content and modeled appearance/navigation/dashboard configuration easy to edit in DevOS and safely operable by authorized AI clients without exposing executable HTML, JavaScript, CSS or unrestricted publication.

**Architecture:** Add canonical document/revision/publication and modeled-configuration commands over existing editorial/public projection services and `app_settings`/UI configuration boundaries. Draft editing remains routine; public publication and visibility changes use exact revision previews and approvals. Appearance commands accept only strict design-system tokens, component IDs and bounded layout schemas. UI and MCP share commands while owner UI remains visual/task-oriented.

**Tech Stack:** Existing domain/database/publication/UI packages, `@semogtw/application`, approvals/change sets, Zod, React/TanStack Start, `@semogtw/mcp`, Vitest, Playwright.

## Global Constraints

- Implement after Command Gateway, agent authorization and approvals/change sets pass.
- Reconcile current editorial lifecycle/public serializers/settings before coding; do not create competing document/publication/config models.
- Draft/private edits are separate from review and publication.
- Public output always comes from allowlisted serializers/revisions; no private entity is loaded then stripped at the edge.
- Publication is bound to one immutable reviewed revision/hash and current visibility/metadata.
- Ordinary publish is high risk; auth/security/privacy-sensitive or broad/bulk publication is critical.
- No arbitrary HTML, JavaScript, CSS, iframe, script URL, executable Markdown extension or raw component import.
- Rich text/Markdown uses a reviewed bounded syntax and sanitization pipeline; imported/provider content is untrusted data.
- Appearance/navigation/dashboard configuration uses versioned strict schemas and known design-system component/token IDs.
- Invalid configuration fails closed and retains the last valid state.
- Owner can preview/reset/revert by new revision/compensating command; immutable publication/audit history is not rewritten.
- AI output is a proposal/draft with authenticated provenance; it is not automatically published.
- Secret/integration settings are outside appearance commands and remain write-only/critical where applicable.
- MCP tools are specific; no generic settings setter or arbitrary document/body executor.
- Mobile/accessibility/public confidentiality remain mandatory.
- Commit and push after each independently reviewable task.

## Planned command catalog

```text
editorial.documents.create
editorial.documents.update_metadata
editorial.revisions.create
editorial.revisions.update
editorial.revisions.submit_review
editorial.revisions.withdraw_review
editorial.publication.publish
editorial.publication.unpublish
editorial.publication.schedule_request
editorial.publication.rollback_revision
appearance.theme.update_tokens
appearance.navigation.update
appearance.dashboard.update_layout
appearance.widgets.configure
appearance.section.reset
```

Task 1 reconciles the catalog with implemented behavior. Scheduling remains a request/state unless a verified host scheduler exists.

## Planned files

```text
packages/application/src/editorial/
  document-commands.ts
  revision-commands.ts
  publication-commands.ts
  previews.ts
  manifests.ts
  *.test.ts
packages/application/src/appearance/
  schemas.ts
  schemas.test.ts
  appearance-commands.ts
  appearance-commands.test.ts
  previews.ts
  manifests.ts
packages/database/src/composition/editorial-command-registry.ts
packages/database/src/composition/editorial-command-registry.test.ts
packages/database/src/composition/appearance-command-registry.ts
packages/database/src/composition/appearance-command-registry.test.ts
packages/mcp/src/editorial-write-tools.ts
packages/mcp/src/editorial-write-tools.test.ts
packages/mcp/src/appearance-write-tools.ts
packages/mcp/src/appearance-write-tools.test.ts
apps/web/src/server/devos-editorial-mutations.ts
apps/web/src/server/devos-appearance-mutations.ts
apps/web/src/routes/devos.editorial.*
apps/web/src/routes/devos.appearance.*
apps/web/src/components/devos/editorial-*
apps/web/src/components/devos/appearance-*
tests/e2e/editorial-appearance-write-parity.spec.ts
docs/testing/2026-08-03-editorial-appearance-write-test-matrix.md
```

### Task 1: Freeze editorial/configuration ownership and risk coverage

**Files:**
- Create: `docs/testing/2026-08-03-editorial-appearance-write-test-matrix.md`
- Modify: `docs/architecture/EDITABILITY_COVERAGE.md`
- Modify: `docs/superpowers/plans/2026-08-03-semogtw-agent-editability-plan-stack.md`

- [ ] Inspect current publication/document/settings routes, services, repositories, serializers and public confidentiality tests.

```bash
git fetch --all --prune
git rev-parse HEAD
rg -n "Publication|Editorial|Revision|publish|unpublish|app_settings|theme|navigation|dashboard|widget" packages apps tests docs
rg -n "createServerFn\(\{ method: \"POST\"|WithAudit\(" apps/web/src/server packages/domain packages/database
```

- [ ] Identify canonical document body format/sanitizer and current modeled configuration source. If no safe editor/config model exists for a catalog entry, mark the entry unsupported and create the schema task before its command.
- [ ] Create coverage rows with public effect, review/hash binding, risk, undo/revision, UI/MCP and scheduler dependency.
- [ ] Run and record current editorial/public-confidentiality/UI tests.
- [ ] Commit inventory.

### Task 2: Define strict editorial document/revision input schemas

**Files:**
- Create: `packages/application/src/editorial/document-commands.ts`
- Create: `packages/application/src/editorial/document-commands.test.ts`
- Create: `packages/application/src/editorial/revision-commands.ts`
- Create: corresponding tests.
- Modify canonical editorial services/composition.

**Interfaces:**

```ts
export const CreateEditorialDocumentInputSchema = z.object({
  kind: z.enum(["note", "project", "journey", "lab", "page"]),
  title: z.string().trim().min(1).max(200),
  slug: z.string().trim().min(1).max(200).nullable(),
  visibility: z.enum(["private", "unlisted", "public"]),
});

export const CreateEditorialRevisionInputSchema = z.object({
  documentId: z.string().min(1).max(200),
  expectedDocumentVersion: z.number().int().nonnegative(),
  title: z.string().trim().min(1).max(200),
  summary: z.string().trim().max(1000),
  bodyFormat: z.literal("restricted_markdown_v1"),
  body: z.string().max(200_000),
  metadata: z.object({
    description: z.string().trim().max(300).nullable(),
    coverMediaId: z.string().min(1).max(200).nullable(),
    tags: z.array(z.string().trim().min(1).max(50)).max(30),
  }),
});
```

Rules:

- slug generated/normalized server-side when null and unique by route rules;
- draft creation private by default in adaptive UI even though schema supports explicit visibility;
- body sanitizer/parser rejects raw HTML/scripts/unsafe URLs/executable extensions and bounds nesting/links/images;
- media IDs resolve approved private/public media policy; no arbitrary embedded data/credential URLs;
- revisions immutable after submission; editing creates a newer draft revision or uses explicit draft update if the existing lifecycle supports it;
- provider/AI provenance server-derived and bounded.

- [ ] Write failing normalization/sanitization/size/link/media/provenance/version tests.
- [ ] Implement thin command adapters over canonical services.
- [ ] Migrate owner draft creation/editing UI through gateway.
- [ ] Run focused tests and commit.

### Task 3: Implement review/submission/publication commands

**Files:**
- Create: `packages/application/src/editorial/publication-commands.ts`
- Create: corresponding tests.
- Create/modify editorial previews.
- Modify publication services/repositories/UI.

Risk:

```text
submit/withdraw review → medium
publish/unpublish ordinary reviewed revision → high
bulk publication, private→public exposure of sensitive category, security/auth docs → critical
rollback to known revision → high/critical according to exposure
schedule request → medium/high; execution remains unavailable without scheduler adapter
```

Publication preview includes:

```text
document/revision title and hash
current/proposed visibility
canonical route/metadata
allowlisted public DTO field diff
media/tags
private marker scan result
reversibility and previous published revision
```

Rules:

- publish binds exact document/revision versions/hash and current sanitizer/public DTO result;
- stale revision/document/media invalidates approval;
- private marker/confidentiality test failure blocks publication;
- publication event append-only;
- unpublish removes public projection according to lifecycle but preserves history;
- rollback creates a new publication event referencing a known revision;
- scheduling stores a request only until host scheduler capability is observed.

- [ ] Write failing lifecycle/hash/stale/confidentiality/public DTO/risk tests.
- [ ] Implement commands and approved executor through existing publication service.
- [ ] Migrate owner review/publish UI with exact preview.
- [ ] Run public confidentiality/build tests and commit.

### Task 4: Define versioned appearance configuration schemas

**Files:**
- Create: `packages/application/src/appearance/schemas.ts`
- Create: `packages/application/src/appearance/schemas.test.ts`
- Modify: existing UI/config contracts and design-system docs.

**Interfaces:**

```ts
export const ThemeConfigurationV1Schema = z.object({
  schemaVersion: z.literal(1),
  mode: z.enum(["dark", "light", "system"]),
  density: z.enum(["comfortable", "compact"]),
  accentToken: z.enum(["primary", "info", "success", "warning"]),
  radiusToken: z.enum(["small", "medium", "large"]),
});

export const NavigationConfigurationV1Schema = z.object({
  schemaVersion: z.literal(1),
  publicItems: z.array(z.object({
    id: z.string().min(1).max(100),
    label: z.string().trim().min(1).max(60),
    routeId: z.string().min(1).max(120),
    visible: z.boolean(),
  })).max(30),
  devosItems: z.array(z.object({
    id: z.string().min(1).max(100),
    label: z.string().trim().min(1).max(60),
    routeId: z.string().min(1).max(120),
    visible: z.boolean(),
  })).max(50),
});

export const DashboardLayoutV1Schema = z.object({
  schemaVersion: z.literal(1),
  columns: z.number().int().min(1).max(4),
  widgets: z.array(z.object({
    instanceId: z.string().min(1).max(100),
    widgetId: z.string().min(1).max(100),
    position: z.object({
      column: z.number().int().min(1).max(4),
      order: z.number().int().nonnegative().max(200),
      span: z.number().int().min(1).max(4),
    }),
    config: z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()])),
  })).max(100),
});
```

Rules:

- route IDs/widget IDs come from static allowlisted registries;
- widget config is validated by widget-specific schema after the outer schema;
- no CSS values, class names, URLs, HTML, JS, component module names or arbitrary code;
- unique IDs/positions and responsive bounds;
- inaccessible contrast/status behavior cannot be configured away;
- invalid stored historical config falls back to last valid/default and surfaces an owner warning.

- [ ] Write failing schema/registry/duplicate/layout/size/code-injection/accessibility tests.
- [ ] Implement versioned schemas/defaults/migration readers without adding executable configuration.
- [ ] Run application/UI tests and commit.

### Task 5: Implement appearance commands and visual owner UI

**Files:**
- Create: `packages/application/src/appearance/appearance-commands.ts`
- Create: corresponding tests/previews/manifests.
- Modify database settings repository/composition.
- Create/modify DevOS appearance routes/components.

Commands/risk:

```text
private dashboard layout/widgets/theme → low/medium
public navigation/theme output → high
reset subsection to known default → medium; public effect high
```

Rules:

- expected config version/hash required;
- server parses full proposed configuration and derives exact diff;
- last valid configuration remains until transaction succeeds;
- history/compensation stores bounded previous config version/hash or revision, not arbitrary raw code;
- normal UI uses preview cards, drag/reorder and toggles; advanced view shows schema version/IDs, not raw JSON editor;
- MCP may send typed schema fields but not JSON text/code.

- [ ] Write failing risk/version/diff/invalid-config/rollback tests.
- [ ] Implement commands through canonical settings/config services.
- [ ] Build guided visual owner UI with 360 px behavior.
- [ ] Run UI/build/confidentiality tests and commit.

### Task 6: Compose editorial/appearance registries and manifests

**Files:**
- Create registry/integration-test files listed above.
- Modify command registry, coverage and public confidentiality fixtures.

- [ ] Register all reconciled commands with transaction-bound services.
- [ ] Prove draft/revision/publication/config/audit/receipt/change-set atomicity where one DB covers them.
- [ ] Prove publish/config public effects are preview/hash/version bound and stale-safe.
- [ ] Prove invalid config/public serializer failure leaves last valid/published state unchanged.
- [ ] Validate manifests and update coverage.
- [ ] Run tests and commit.

### Task 7: Expose specific filtered editorial and appearance MCP tools

**Files:**
- Create MCP tool/test files listed above.
- Modify catalog/composition after write gates.

Representative tools:

```text
devos_create_editorial_document
devos_create_editorial_revision
devos_update_editorial_revision
devos_submit_editorial_review
devos_publish_editorial_revision
devos_unpublish_editorial_document
devos_prepare_publication_rollback
devos_update_theme
devos_update_navigation
devos_update_dashboard_layout
devos_configure_dashboard_widget
devos_reset_appearance_section
```

- [ ] Test scopes/capabilities/document/environment resources, draft-only profiles, strict schemas, provenance, approvals, stale hashes, idempotency, switches and output bounds.
- [ ] Assert no raw HTML/CSS/JS/JSON editor, generic settings setter or silent publish tool.
- [ ] Implement only after remote write gates pass.
- [ ] Run MCP/public confidentiality tests and commit.

### Task 8: Verify editorial/appearance UI/MCP parity E2E

**Files:**
- Create: `tests/e2e/editorial-appearance-write-parity.spec.ts`
- Modify test matrix, coverage, design/MCP/security/runbook/changelog docs.

Scenarios:

1. create private draft/revision manually and through authorized AI proposal;
2. unsafe HTML/script/URL/provider injection rejected;
3. submit review and publish only exact current revision after approval;
4. stale edit/media/public DTO invalidates approval;
5. unpublish/rollback preserves publication history;
6. schedule request remains pending/unavailable without scheduler;
7. update private dashboard/theme with typed visual controls;
8. public navigation/theme change requires approval;
9. invalid widget/layout keeps previous valid config;
10. MCP discovery excludes generic/code setters;
11. revoke/pause writes while reads/public site continue;
12. anonymous output contains only approved publication/config projections;
13. 360 px editing/review/config UI works.

Run application/domain/database/MCP/web/build/Playwright/editability/confidentiality gates and update docs by reference.

## Acceptance criteria

- editorial drafts/revisions/review/publication use canonical commands and immutable revision/hash bindings;
- no AI/provider output is silently published;
- public serializers/confidentiality remain allowlisted and fail closed;
- appearance/navigation/dashboard use versioned known schemas/components/tokens only;
- no arbitrary HTML/JS/CSS/config code or generic setter exists;
- last valid configuration/public state survives invalid/stale changes;
- owner UI is visual/guided/mobile while MCP is strict/typed;
- public effects use approvals and exact previews;
- E2E, editability, MCP boundary, build and confidentiality gates pass.
