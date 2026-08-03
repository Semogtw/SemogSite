# Semogtw Growth Adaptive Owner Experience Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Track progress with the checkboxes below.

**Goal:** Make Growth goal creation and progress management fast, understandable and fully usable without an AI provider while preserving the canonical Growth model and derived-progress rules.

**Architecture:** Extend the Growth core with deterministic template/weight services, shared assistance-provenance contracts and task-oriented React components. Browser flows call owner-authenticated canonical Growth services. Later AI/MCP proposals use the same commands, but no model, API or MCP client is required by this plan.

**Tech Stack:** Node.js 22, TypeScript strict mode, Zod, React, TanStack Start/Router, SQLite/Drizzle, Vitest, Playwright and pnpm workspaces.

## Constraints

- Start from the newest consolidated branch containing the Growth and adaptive-owner specifications.
- Extend `2026-08-03-semogtw-learning-goals-core.md`; do not redefine Growth entities, evidence semantics or progress mathematics.
- Normal creation/editing works with no AI API, Spark or MCP connection.
- Templates/defaults are deterministic and never labeled as AI.
- Never persist or accept an arbitrary canonical goal percentage.
- No measurable checkpoint basis means an indeterminate progress state, not fake precision.
- Normal creation asks only for the minimum fields; technical details use progressive disclosure.
- Owner writes retain authentication, CSRF, bounded validation, idempotency, optimistic conflicts and audit.
- Provider/client provenance is bounded metadata, never credentials, prompts or raw output.
- All flows work at 360 px without horizontal scrolling.
- Commit and push after each independently reviewable task.

## Planned files

```text
packages/contracts/src/private/assistance.ts
packages/contracts/src/private/assistance.test.ts
packages/domain/src/growth/checkpoint-weights.ts
packages/domain/src/growth/checkpoint-weights.test.ts
packages/domain/src/growth/goal-templates.ts
packages/domain/src/growth/goal-templates.test.ts
packages/domain/src/growth/quick-create.ts
packages/domain/src/growth/quick-create.test.ts
packages/ui/src/primitives/advanced-disclosure.tsx
packages/ui/src/primitives/assistance-source.tsx
packages/ui/src/primitives/progress-meter.tsx
packages/ui/src/primitives/progress-meter.test.tsx
apps/web/src/components/devos/growth-quick-create.tsx
apps/web/src/components/devos/growth-template-picker.tsx
apps/web/src/components/devos/growth-checkpoint-builder.tsx
apps/web/src/components/devos/growth-progress-explanation.tsx
apps/web/src/components/devos/growth-advanced-settings.tsx
apps/web/src/server/devos-growth-quick-create.ts
apps/web/src/server/devos-growth-template-preview.ts
apps/web/src/routes/devos.growth.index.tsx
apps/web/src/routes/devos.growth.goals.$goalId.tsx
apps/web/src/styles/growth.css
tests/e2e/growth-adaptive-owner-experience.spec.ts
docs/testing/2026-08-03-growth-adaptive-owner-experience-test-matrix.md
```

If the implemented Growth slice uses different confirmed paths, update this plan and the Growth core plan together before coding. Do not create duplicate route/component families.

---

### Task 1: Reconcile the implemented Growth baseline and UX ownership

**Files:** Create the test matrix; modify the Growth core plan and plan-stack index.

- [ ] Inspect the newest branch, exact head, migrations and Growth files.

```bash
git fetch --all --prune
git status --short --branch
git rev-parse HEAD
find packages/domain/src packages/database/src apps/web/src -maxdepth 5 -type f | sort
rg -n "LearningGoal|LearningCheckpoint|deriveGoalProgress|devos\.growth|learning-goal" packages apps tests docs
```

- [ ] Run and record the applicable baseline without copying historical counts.

```bash
pnpm install --frozen-lockfile
pnpm --filter @semogtw/domain test
pnpm --filter @semogtw/contracts test
pnpm --filter @semogtw/ui test
pnpm --filter @semogtw/web test
pnpm --filter @semogtw/web typecheck
pnpm check:boundaries
pnpm check:public-confidentiality
```

- [ ] Add a short ownership note to the Growth plan: Growth owns entities/persistence/lifecycle/formula; this plan owns guided creation, deterministic assistance, progressive disclosure and progress presentation.
- [ ] Record unavailable commands as `environment_or_plan_mismatch`, not as passes.
- [ ] Commit and push.

```bash
git add docs/testing/2026-08-03-growth-adaptive-owner-experience-test-matrix.md docs/superpowers/plans/2026-08-03-semogtw-learning-goals-core.md docs/superpowers/plans/2026-08-03-semogtw-agent-editability-plan-stack.md
git commit -m "docs: reconcile adaptive Growth baseline"
git push
```

### Task 2: Define truthful assistance provenance contracts

**Files:** Create `packages/contracts/src/private/assistance.ts`, its tests, and export it from the private contracts entry point.

```ts
export const AssistanceOriginSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("manual") }),
  z.object({
    kind: z.literal("deterministic_rule"),
    ruleId: z.string().min(1).max(120),
    ruleVersion: z.number().int().positive(),
  }),
  z.object({
    kind: z.literal("template"),
    templateId: z.string().min(1).max(120),
    templateVersion: z.number().int().positive(),
  }),
  z.object({
    kind: z.literal("external_ai_client"),
    clientId: z.string().min(1).max(200),
    declaredProvider: z.string().trim().min(1).max(120).nullable(),
    declaredModel: z.string().trim().min(1).max(120).nullable(),
  }),
  z.object({
    kind: z.literal("internal_model_provider"),
    providerId: z.string().min(1).max(120),
    modelId: z.string().min(1).max(120),
  }),
]);

export const AssistanceAvailabilitySchema = z.object({
  deterministic: z.literal(true),
  externalAiConnected: z.boolean(),
  internalProviderConfigured: z.boolean(),
});
```

- [ ] Write failing tests for every origin, invalid empty client/provider IDs and deterministic-only availability.
- [ ] Confirm the tests fail before implementation.

```bash
pnpm --filter @semogtw/contracts exec vitest run src/private/assistance.test.ts
```

- [ ] Implement/export the schemas without public DTO exposure.
- [ ] Run tests, typecheck and confidentiality scan.

```bash
pnpm --filter @semogtw/contracts exec vitest run src/private/assistance.test.ts
pnpm --filter @semogtw/contracts typecheck
pnpm check:public-confidentiality
```

- [ ] Commit and push.

### Task 3: Implement deterministic integer checkpoint weights

**Files:** Create `checkpoint-weights.ts`, tests and Growth exports.

```ts
export type CheckpointWeightInput = {
  id: string;
  weight: number | null;
  weightMode: "automatic" | "custom";
};

export type CheckpointWeightProposal = {
  checkpoints: readonly {
    id: string;
    before: number | null;
    after: number;
    weightMode: "automatic" | "custom";
  }[];
  total: 100;
  requiresConfirmation: boolean;
  reason:
    | "all_weights_automatic"
    | "custom_weights_preserved"
    | "custom_weights_need_rebalance";
};

export function distributeEqualIntegerWeights(
  checkpointIds: readonly string[],
): Readonly<Record<string, number>>;

export function proposeCheckpointWeightRebalance(
  checkpoints: readonly CheckpointWeightInput[],
): CheckpointWeightProposal;
```

Deterministic rounding:

1. reject zero, empty or duplicate IDs;
2. `base = Math.floor(100 / count)`;
3. `remainder = 100 - base * count`;
4. the first `remainder` IDs in canonical sequence receive `base + 1`;
5. the remainder receive `base`;
6. never sort by localized title.

- [ ] Write failing tests for 3→`34/33/33`, 6→`17/17/17/17/16/16`, duplicate IDs and custom-weight confirmation.
- [ ] Implement pure functions and stable error codes.
- [ ] Run domain tests/typecheck/boundaries and commit.

### Task 4: Add versioned deterministic goal templates

**Files:** Create `goal-templates.ts`, tests and exports.

```ts
export type LearningGoalTemplateId =
  | "learn_programming_language"
  | "complete_course"
  | "build_and_ship_project"
  | "prepare_for_exam"
  | "earn_credential";

export function listLearningGoalTemplates(): readonly LearningGoalTemplate[];
export function materializeLearningGoalTemplate(
  templateId: LearningGoalTemplateId,
): MaterializedLearningGoalTemplate;
```

Version-1 templates have five checkpoints each:

```text
learn_programming_language: Fundamentos; Prática guiada; Bibliotecas e ferramentas; Projeto aplicado; Revisão e evidência final
complete_course: Preparar materiais e ambiente; Concluir conteúdo; Exercícios/avaliações; Aplicação/resumo; Registrar certificado/evidência
build_and_ship_project: Definir escopo; Primeira versão; Testes; Documentação/entrega; Publicar/apresentar
prepare_for_exam: Mapear conteúdo; Fundamentos; Questões; Simulado; Revisão/prova
earn_credential: Requisitos; Conteúdo obrigatório; Avaliação; Receber credencial; Verificar/registrar
```

- [ ] Test stable IDs/order/version/copy, unique checkpoint keys, deterministic repeated output and exact total 100 using Task 3.
- [ ] Implement without personalization or model inference.
- [ ] Run tests/typecheck and commit.

### Task 5: Prepare and persist quick-created drafts atomically

**Files:** Create `quick-create.ts`, tests; modify the implemented Growth service/repository files confirmed in Task 1.

```ts
export type QuickCreateLearningGoalInput = {
  title: string;
  targetDate: string | null;
  motivation: string | null;
  templateId: LearningGoalTemplateId | null;
};

export function prepareQuickLearningGoalDraft(
  input: QuickCreateLearningGoalInput,
): QuickCreateLearningGoalDraft;
```

Rules:

- title trimmed `1..160`;
- optional motivation max 1000; empty becomes null;
- date is `YYYY-MM-DD` or null; no invented deadline;
- priority defaults `medium` and status `draft`;
- no template gives manual origin and zero checkpoints;
- template uses the frozen deterministic catalog;
- persistence writes goal, checkpoints, Growth events, global audit and idempotency result in one transaction.

- [ ] Write failing validation/materialization/atomic rollback tests.
- [ ] Implement the pure preparation function and transaction-bound service extension.
- [ ] Run Growth/domain/database tests and commit.

### Task 6: Add adaptive shared UI primitives

**Files:** Create `advanced-disclosure.tsx`, `assistance-source.tsx`, `progress-meter.tsx`, tests and exports/styles.

```tsx
export function AdvancedDisclosure(props: {
  summary: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
  className?: string;
}): React.JSX.Element;

export function AssistanceSource(props: {
  origin: AssistanceOrigin;
}): React.JSX.Element;

export function ProgressMeter(props: {
  value: number | null;
  label: string;
  explanation: string;
  size?: "compact" | "regular";
}): React.JSX.Element;
```

Copy mapping:

```text
manual → Inserido manualmente
deterministic_rule → Calculado automaticamente
template → Estrutura de modelo
external_ai_client → Proposta de IA conectada
internal_model_provider → Proposta de IA configurada
```

- [ ] Write failing component tests for indeterminate/numeric ARIA behavior and truthful provenance labels.
- [ ] Implement `AdvancedDisclosure` with semantic `<details>/<summary>`.
- [ ] Reject numeric progress outside finite `0..100`.
- [ ] Run UI tests/typecheck and commit.

### Task 7: Add explicit owner-only template preview and quick-create handlers

**Files:** Create server files/tests and modify Growth database composition.

```ts
export async function handlePreviewLearningGoalTemplate(input: {
  data: { templateId: LearningGoalTemplateId };
}): Promise<LearningGoalTemplatePreviewResult>;

export async function handleQuickCreateLearningGoal(input: {
  data: QuickCreateLearningGoalRequest;
}): Promise<QuickCreateLearningGoalResult>;

export const previewLearningGoalTemplateFn = createServerFn({ method: "GET" })
  .validator(PreviewLearningGoalTemplateRequestSchema)
  .handler(handlePreviewLearningGoalTemplate);

export const quickCreateLearningGoalFn = createServerFn({ method: "POST" })
  .validator(QuickCreateLearningGoalRequestSchema)
  .handler(handleQuickCreateLearningGoal);
```

`QuickCreateLearningGoalRequestSchema` contains `csrfToken`, UUID `idempotencyKey`, title, nullable date/motivation and nullable template ID. The handlers:

1. resolve the owner before private reads;
2. verify CSRF for mutation;
3. construct server-owned principal/correlation/audit metadata;
4. invoke the canonical Growth service;
5. return stable Portuguese results without raw exceptions.

- [ ] Write failing tests for owner-before-read, CSRF, deterministic preview, same-key replay, changed-payload conflict, storage failure and zero model/API calls.
- [ ] Implement the named handlers and server functions exactly; do not replace them with inline placeholder callbacks.
- [ ] Run focused web tests/typecheck and commit.

### Task 8: Build the task-oriented quick-create interface

**Files:** Create Growth quick-create/template/checkpoint components/tests; modify the Growth index route/style.

Normal fields:

```text
O que deseja alcançar? — required
Até quando? — optional
Por que isso importa? — optional
Usar uma estrutura pronta? — optional
```

Normal UI must not ask for slug/ID, status enum, weight numbers, completion JSON, evidence policy, MCP/client metadata or percentage.

- [ ] Write failing tests for normal fields, hidden technical fields, template preview label, UUID idempotency and preserved input on validation error.
- [ ] Implement card/checklist preview and responsive single-column layout at 360 px.
- [ ] Run web tests/typecheck and commit.

### Task 9: Add explainable progress and progressive advanced settings

**Files:** Create progress/advanced components/tests; modify goal detail route/style and the rebalance server command.

Normal copy:

```text
65% — 3 de 5 checkpoints concluídos, considerando os pesos atuais.
```

Indeterminate copy:

```text
Progresso ainda não calculável.
Adicione checkpoints ou defina uma regra mensurável.
```

Advanced settings include weights/mode, completion rule, numeric unit/target, deterministic redistribution preview and a separate technical MCP-reference disclosure.

- [ ] Test numeric and indeterminate states, contribution sum, ARIA, collapsed defaults and custom-weight confirmation.
- [ ] Server recalculates rebalance from current versions; it never trusts client-computed weights.
- [ ] Implement through shared primitives and canonical Growth services.
- [ ] Run focused tests/typecheck and commit.

### Task 10: Verify no-AI behavior, mobile usability and confidentiality

**Files:** Create E2E; update test matrix, `docs/LEARNING_GROWTH.md`, `docs/DESIGN_SYSTEM.md` and changelog by reference.

E2E must:

1. run with no internal provider;
2. log in and create `Aprender Python para automação` from the programming template at 360×800;
3. verify five checkpoint cards and exact automatic total 100;
4. verify no available `Gerar com IA` control;
5. verify measurable initial 0%, then 20% after completing a 20-point checkpoint;
6. inspect contribution explanation;
7. verify automatic rebalance preview and custom-weight confirmation;
8. prove no horizontal overflow;
9. sign out and confirm private-route denial before data load;
10. confirm public HTML/payloads contain no goal title, template ID or assistance origin.

Run:

```bash
pnpm check:boundaries
pnpm check:public-confidentiality
pnpm --filter @semogtw/contracts test
pnpm --filter @semogtw/domain test
pnpm --filter @semogtw/database test
pnpm --filter @semogtw/ui test
pnpm --filter @semogtw/web test
pnpm --filter @semogtw/web typecheck
pnpm --filter @semogtw/web build
pnpm exec playwright test tests/e2e/growth-adaptive-owner-experience.spec.ts
```

- [ ] Record exact results against the exact head; classify unavailable gates honestly.
- [ ] Scan for false AI labels and unresolved placeholders.

```bash
rg -n "smart suggestion|sugestão inteligente|TODO|TBD|implement later|fill in|/\*.*\*/" packages apps tests docs/superpowers/plans/2026-08-03-semogtw-growth-adaptive-owner-experience.md
```

- [ ] Update docs with implemented routes/templates/evidence only, linking canonical specs instead of copying them.
- [ ] Commit and push closeout.

## Acceptance criteria

- title-only goal creation works;
- versioned templates work without AI;
- automatic integer weights total exactly 100;
- custom weights are never silently overwritten;
- percentages are derived/explainable and unmeasurable progress is indeterminate;
- normal UI avoids raw IDs/enums/formulas/schema tables;
- advanced settings remain accessible;
- provenance labels are truthful;
- no AI capability is advertised without a connected/configured model;
- owner auth, CSRF, idempotency, audit and conflict behavior pass;
- 360 px and public-confidentiality E2E pass;
- documentation points to canonical specs rather than duplicating them.
