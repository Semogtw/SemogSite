# Semogtw Growth Adaptive Owner Experience Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Growth goal creation and progress management fast, understandable and fully usable without an AI provider while preserving the canonical Growth model and derived-progress rules.

**Architecture:** Extend the existing Growth core with pure deterministic template/weight services, shared provenance contracts and task-oriented React components. Browser flows call the existing owner-authenticated Growth mutation services; AI-generated proposals remain optional inputs through later command/MCP plans and never replace manual/template workflows.

**Tech Stack:** Node.js 22, TypeScript strict mode, Zod, React, TanStack Start/Router, SQLite/Drizzle, Vitest, Playwright, pnpm workspaces.

## Global Constraints

- Implement from the newest consolidated branch containing both `2026-08-03-semogtw-learning-growth-evidence-design.md` and `2026-08-03-semogtw-adaptive-owner-experience-design.md`.
- This plan extends `2026-08-03-semogtw-learning-goals-core.md`; it does not redefine Growth entities, evidence semantics or the progress formula.
- Core creation/editing must work with no AI API, no Spark connection and no MCP client.
- Deterministic templates/defaults must be reproducible from the same inputs and identified as automatic/template behavior, never as AI.
- Do not persist or accept an arbitrary canonical goal percentage.
- When no measurable checkpoint basis exists, show an indeterminate state instead of `0%` presented as meaningful progress.
- Keep normal creation forms short; technical fields use progressive disclosure.
- Default visibility remains private and publication is outside this plan.
- Owner mutations continue to require owner authentication, CSRF, bounded validation, optimistic conflict behavior and audit according to the Growth core plan.
- AI provenance contracts added here do not invoke a model and do not authorize MCP writes.
- All compact/mobile flows must work at 360 px without horizontal scrolling.
- Commit and push after every independently reviewable task.

---

## Planned file structure

```text
packages/contracts/src/private/
  assistance.ts
  assistance.test.ts

packages/domain/src/growth/
  checkpoint-weights.ts
  checkpoint-weights.test.ts
  goal-templates.ts
  goal-templates.test.ts
  quick-create.ts
  quick-create.test.ts

packages/ui/src/primitives/
  advanced-disclosure.tsx
  assistance-source.tsx
  progress-meter.tsx
  progress-meter.test.tsx

apps/web/src/components/devos/
  growth-quick-create.tsx
  growth-template-picker.tsx
  growth-checkpoint-builder.tsx
  growth-progress-explanation.tsx
  growth-advanced-settings.tsx

apps/web/src/server/
  devos-growth-quick-create.ts
  devos-growth-template-preview.ts

apps/web/src/routes/
  devos.growth.index.tsx
  devos.growth.goals.$goalId.tsx

apps/web/src/styles/
  growth.css

tests/e2e/
  growth-adaptive-owner-experience.spec.ts

docs/testing/
  2026-08-03-growth-adaptive-owner-experience-test-matrix.md
```

If the Growth core implementation uses a different confirmed path, update this plan and the Growth plan together before coding. Do not create duplicate route/component families.

---

### Task 1: Reconcile the implemented Growth baseline and UX ownership

**Files:**
- Create: `docs/testing/2026-08-03-growth-adaptive-owner-experience-test-matrix.md`
- Modify: `docs/superpowers/plans/2026-08-03-semogtw-learning-goals-core.md`
- Modify: `docs/superpowers/plans/2026-08-03-semogtw-agent-editability-plan-stack.md`

**Interfaces:**
- Consumes: implemented Growth goal/checkpoint services, current route/component names and observed test commands.
- Produces: exact base SHA, confirmed file map and a non-duplicated ownership note linking Growth semantics to the adaptive-owner specification.

- [ ] **Step 1: Inspect the newest branch and Growth implementation state**

```bash
git fetch --all --prune
git status --short --branch
git rev-parse HEAD
find packages/domain/src/growth packages/database/src apps/web/src -maxdepth 4 -type f | sort
rg -n "LearningGoal|deriveGoalProgress|devos.growth|learning-goal-form" packages apps tests docs
```

Expected: record whether the Growth core is unimplemented, partially implemented or complete. Do not assume the planned file names exist.

- [ ] **Step 2: Run the observed applicable baseline**

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

Expected: write exact pass/fail/block results and counts into the test matrix. An unavailable package script is recorded as `environment_or_plan_mismatch`, not silently skipped.

- [ ] **Step 3: Add the ownership note to the Growth plan**

Add a short section with this exact meaning:

```markdown
## Adaptive owner experience

Creation flow, deterministic templates/defaults, progressive disclosure, explainable progress and truthful AI availability are governed by `../specs/2026-08-03-semogtw-adaptive-owner-experience-design.md` and executed by `2026-08-03-semogtw-growth-adaptive-owner-experience.md`. The Growth plan remains canonical for entities, persistence, lifecycle and progress mathematics.
```

- [ ] **Step 4: Commit**

```bash
git add docs/testing/2026-08-03-growth-adaptive-owner-experience-test-matrix.md \
  docs/superpowers/plans/2026-08-03-semogtw-learning-goals-core.md \
  docs/superpowers/plans/2026-08-03-semogtw-agent-editability-plan-stack.md
git commit -m "docs: reconcile adaptive Growth baseline"
git push
```

---

### Task 2: Define truthful assistance provenance contracts

**Files:**
- Create: `packages/contracts/src/private/assistance.ts`
- Create: `packages/contracts/src/private/assistance.test.ts`
- Modify: `packages/contracts/src/index.ts`

**Interfaces:**

```ts
import { z } from "zod";

export const AssistanceOriginSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("manual"),
  }),
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

export type AssistanceOrigin = z.infer<typeof AssistanceOriginSchema>;

export const AssistanceAvailabilitySchema = z.object({
  deterministic: z.literal(true),
  externalAiConnected: z.boolean(),
  internalProviderConfigured: z.boolean(),
});

export type AssistanceAvailability = z.infer<
  typeof AssistanceAvailabilitySchema
>;
```

- [ ] **Step 1: Write failing schema tests**

```ts
import { describe, expect, it } from "vitest";
import {
  AssistanceAvailabilitySchema,
  AssistanceOriginSchema,
} from "./assistance";

describe("AssistanceOriginSchema", () => {
  it("accepts a versioned deterministic rule", () => {
    expect(
      AssistanceOriginSchema.parse({
        kind: "deterministic_rule",
        ruleId: "growth.equal_checkpoint_weights",
        ruleVersion: 1,
      }),
    ).toEqual({
      kind: "deterministic_rule",
      ruleId: "growth.equal_checkpoint_weights",
      ruleVersion: 1,
    });
  });

  it("rejects an AI origin without an authenticated client/provider id", () => {
    expect(() =>
      AssistanceOriginSchema.parse({
        kind: "external_ai_client",
        clientId: "",
        declaredProvider: "Gemini",
        declaredModel: null,
      }),
    ).toThrow();
  });

  it("keeps deterministic assistance available with no AI", () => {
    expect(
      AssistanceAvailabilitySchema.parse({
        deterministic: true,
        externalAiConnected: false,
        internalProviderConfigured: false,
      }),
    ).toEqual({
      deterministic: true,
      externalAiConnected: false,
      internalProviderConfigured: false,
    });
  });
});
```

- [ ] **Step 2: Run and verify failure**

```bash
pnpm --filter @semogtw/contracts exec vitest run src/private/assistance.test.ts
```

Expected: FAIL because `assistance.ts` does not exist.

- [ ] **Step 3: Implement and export the schemas exactly as specified**

Keep the contract private-only. Do not add it to public DTO modules and do not include provider credentials, prompts or raw model output.

- [ ] **Step 4: Run focused tests and typecheck**

```bash
pnpm --filter @semogtw/contracts exec vitest run src/private/assistance.test.ts
pnpm --filter @semogtw/contracts typecheck
pnpm check:public-confidentiality
```

Expected: PASS and no private assistance markers in public output fixtures.

- [ ] **Step 5: Commit**

```bash
git add packages/contracts/src/private/assistance.ts \
  packages/contracts/src/private/assistance.test.ts \
  packages/contracts/src/index.ts
git commit -m "feat: define assistance provenance contracts"
git push
```

---

### Task 3: Implement deterministic checkpoint weight distribution

**Files:**
- Create: `packages/domain/src/growth/checkpoint-weights.ts`
- Create: `packages/domain/src/growth/checkpoint-weights.test.ts`
- Modify: `packages/domain/src/growth/index.ts`

**Interfaces:**

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

Deterministic rounding rule:

1. reject zero checkpoints and duplicate/empty IDs;
2. compute `base = Math.floor(100 / count)`;
3. compute `remainder = 100 - base * count`;
4. assign `base + 1` to the first `remainder` checkpoint IDs in the supplied canonical sequence;
5. assign `base` to the rest;
6. never sort by localized display text.

- [ ] **Step 1: Write failing unit tests**

```ts
import { describe, expect, it } from "vitest";
import {
  distributeEqualIntegerWeights,
  proposeCheckpointWeightRebalance,
} from "./checkpoint-weights";

describe("distributeEqualIntegerWeights", () => {
  it("preserves an exact total for three checkpoints", () => {
    expect(distributeEqualIntegerWeights(["a", "b", "c"])).toEqual({
      a: 34,
      b: 33,
      c: 33,
    });
  });

  it("rejects duplicate ids", () => {
    expect(() => distributeEqualIntegerWeights(["a", "a"])).toThrow(
      "DUPLICATE_CHECKPOINT_ID",
    );
  });
});

describe("proposeCheckpointWeightRebalance", () => {
  it("does not require confirmation when all weights remain automatic", () => {
    expect(
      proposeCheckpointWeightRebalance([
        { id: "a", weight: 50, weightMode: "automatic" },
        { id: "b", weight: 50, weightMode: "automatic" },
        { id: "c", weight: null, weightMode: "automatic" },
      ]),
    ).toMatchObject({
      total: 100,
      requiresConfirmation: false,
      reason: "all_weights_automatic",
    });
  });

  it("requires confirmation before rewriting custom weights", () => {
    expect(
      proposeCheckpointWeightRebalance([
        { id: "a", weight: 70, weightMode: "custom" },
        { id: "b", weight: 30, weightMode: "custom" },
        { id: "c", weight: null, weightMode: "automatic" },
      ]),
    ).toMatchObject({
      total: 100,
      requiresConfirmation: true,
      reason: "custom_weights_need_rebalance",
    });
  });
});
```

- [ ] **Step 2: Run and verify failure**

```bash
pnpm --filter @semogtw/domain exec vitest run src/growth/checkpoint-weights.test.ts
```

Expected: FAIL because the module does not exist.

- [ ] **Step 3: Implement pure functions**

Use stable domain errors:

```ts
export type CheckpointWeightErrorCode =
  | "CHECKPOINTS_REQUIRED"
  | "CHECKPOINT_ID_REQUIRED"
  | "DUPLICATE_CHECKPOINT_ID"
  | "INVALID_CUSTOM_WEIGHT"
  | "CUSTOM_WEIGHT_TOTAL_EXCEEDED";
```

Do not read time, database state, locale or provider data.

- [ ] **Step 4: Run domain checks**

```bash
pnpm --filter @semogtw/domain exec vitest run src/growth/checkpoint-weights.test.ts
pnpm --filter @semogtw/domain typecheck
pnpm check:boundaries
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/domain/src/growth/checkpoint-weights.ts \
  packages/domain/src/growth/checkpoint-weights.test.ts \
  packages/domain/src/growth/index.ts
git commit -m "feat: add deterministic checkpoint weights"
git push
```

---

### Task 4: Add versioned deterministic goal templates

**Files:**
- Create: `packages/domain/src/growth/goal-templates.ts`
- Create: `packages/domain/src/growth/goal-templates.test.ts`
- Modify: `packages/domain/src/growth/index.ts`

**Interfaces:**

```ts
export type LearningGoalTemplateId =
  | "learn_programming_language"
  | "complete_course"
  | "build_and_ship_project"
  | "prepare_for_exam"
  | "earn_credential";

export type LearningGoalTemplate = {
  id: LearningGoalTemplateId;
  version: 1;
  labelPtBr: string;
  descriptionPtBr: string;
  checkpoints: readonly {
    key: string;
    titlePtBr: string;
    descriptionPtBr: string;
    required: boolean;
    completionMode: { kind: "binary" };
  }[];
};

export type MaterializedLearningGoalTemplate = {
  origin: {
    kind: "template";
    templateId: LearningGoalTemplateId;
    templateVersion: 1;
  };
  checkpoints: readonly {
    key: string;
    title: string;
    description: string;
    required: boolean;
    weight: number;
    weightMode: "automatic";
    completionMode: { kind: "binary" };
  }[];
};

export function listLearningGoalTemplates(): readonly LearningGoalTemplate[];
export function materializeLearningGoalTemplate(
  templateId: LearningGoalTemplateId,
): MaterializedLearningGoalTemplate;
```

The exact initial checkpoint copy is:

```text
learn_programming_language
  Fundamentos
  Prática guiada
  Bibliotecas e ferramentas
  Projeto aplicado
  Revisão e evidência final

complete_course
  Preparar materiais e ambiente
  Concluir o conteúdo principal
  Realizar exercícios ou avaliações
  Produzir uma aplicação ou resumo
  Registrar certificado ou evidência

build_and_ship_project
  Definir resultado e escopo
  Construir primeira versão funcional
  Adicionar testes e validação
  Preparar documentação e entrega
  Publicar ou apresentar o resultado

prepare_for_exam
  Mapear conteúdo e critérios
  Estudar fundamentos
  Praticar questões
  Fazer simulado
  Revisar lacunas e realizar a prova

earn_credential
  Confirmar requisitos
  Completar conteúdo obrigatório
  Realizar avaliação
  Solicitar ou receber credencial
  Verificar e registrar a credencial
```

- [ ] **Step 1: Write failing template tests**

Test stable order, unique IDs/keys, version `1`, non-empty Brazilian Portuguese copy, exact 100-point weight total and deterministic repeated materialization.

```ts
it("materializes five automatically weighted checkpoints", () => {
  const result = materializeLearningGoalTemplate("learn_programming_language");
  expect(result.checkpoints).toHaveLength(5);
  expect(result.checkpoints.reduce((sum, item) => sum + item.weight, 0)).toBe(
    100,
  );
  expect(result.origin).toEqual({
    kind: "template",
    templateId: "learn_programming_language",
    templateVersion: 1,
  });
});
```

- [ ] **Step 2: Run and verify failure**

```bash
pnpm --filter @semogtw/domain exec vitest run src/growth/goal-templates.test.ts
```

Expected: FAIL because the template catalog does not exist.

- [ ] **Step 3: Implement the frozen version-1 catalog**

Use `distributeEqualIntegerWeights()` from Task 3. Do not customize output from goal title, user history or model inference.

- [ ] **Step 4: Run tests and commit**

```bash
pnpm --filter @semogtw/domain exec vitest run src/growth/goal-templates.test.ts src/growth/checkpoint-weights.test.ts
pnpm --filter @semogtw/domain typecheck
git add packages/domain/src/growth/goal-templates.ts \
  packages/domain/src/growth/goal-templates.test.ts \
  packages/domain/src/growth/index.ts
git commit -m "feat: add deterministic learning goal templates"
git push
```

---

### Task 5: Define quick-create input and canonical draft creation

**Files:**
- Create: `packages/domain/src/growth/quick-create.ts`
- Create: `packages/domain/src/growth/quick-create.test.ts`
- Modify: `packages/domain/src/growth/index.ts`
- Modify: the implemented Growth goal service/repository files confirmed in Task 1.

**Interfaces:**

```ts
export type QuickCreateLearningGoalInput = {
  title: string;
  targetDate: string | null;
  motivation: string | null;
  templateId: LearningGoalTemplateId | null;
};

export type QuickCreateLearningGoalDraft = {
  goal: {
    title: string;
    description: "";
    motivation: string | null;
    targetDate: string | null;
    priority: "medium";
    status: "draft";
  };
  checkpoints: MaterializedLearningGoalTemplate["checkpoints"];
  origin:
    | { kind: "manual" }
    | {
        kind: "template";
        templateId: LearningGoalTemplateId;
        templateVersion: 1;
      };
};

export function prepareQuickLearningGoalDraft(
  input: QuickCreateLearningGoalInput,
): QuickCreateLearningGoalDraft;
```

Validation:

- title: trimmed, `1..160` characters;
- target date: `YYYY-MM-DD` or `null`, no invented default;
- motivation: trimmed, at most `1000`, empty becomes `null`;
- no template means zero checkpoints and `manual` origin;
- template means deterministic materialization from Task 4;
- priority defaults to `medium`;
- first save remains `draft` unless the existing Growth specification explicitly requires another state.

- [ ] **Step 1: Write failing quick-create tests**

```ts
it("creates a minimal draft without AI or template", () => {
  expect(
    prepareQuickLearningGoalDraft({
      title: "  Aprender Python para automação  ",
      targetDate: null,
      motivation: null,
      templateId: null,
    }),
  ).toMatchObject({
    goal: {
      title: "Aprender Python para automação",
      priority: "medium",
      status: "draft",
      targetDate: null,
    },
    checkpoints: [],
    origin: { kind: "manual" },
  });
});

it("applies a deterministic template without claiming AI", () => {
  const result = prepareQuickLearningGoalDraft({
    title: "Aprender Java para APIs",
    targetDate: "2026-12-01",
    motivation: "Criar serviços próprios",
    templateId: "learn_programming_language",
  });
  expect(result.origin.kind).toBe("template");
  expect(result.checkpoints.reduce((sum, item) => sum + item.weight, 0)).toBe(
    100,
  );
});
```

- [ ] **Step 2: Run and verify failure**

```bash
pnpm --filter @semogtw/domain exec vitest run src/growth/quick-create.test.ts
```

Expected: FAIL.

- [ ] **Step 3: Implement the pure preparation function**

Return stable validation errors:

```ts
export type QuickCreateLearningGoalErrorCode =
  | "TITLE_REQUIRED"
  | "TITLE_TOO_LONG"
  | "MOTIVATION_TOO_LONG"
  | "TARGET_DATE_INVALID"
  | "TEMPLATE_UNKNOWN";
```

- [ ] **Step 4: Extend the existing atomic Growth creation service**

The service must persist the goal, materialized checkpoints, append-only Growth events and global audit in one transaction. The persisted origin contains only bounded provenance metadata; no prompt or raw provider response is added.

- [ ] **Step 5: Run focused domain/database tests**

```bash
pnpm --filter @semogtw/domain exec vitest run src/growth/quick-create.test.ts src/growth/goal-service.test.ts
pnpm --filter @semogtw/database test -- learning-goal-repository.test.ts
```

Expected: creating from a template either persists goal/checkpoints/events/audit together or persists nothing.

- [ ] **Step 6: Commit**

```bash
git add packages/domain/src/growth \
  packages/database/src/repositories \
  packages/database/src/schema
git commit -m "feat: add deterministic Growth quick creation"
git push
```

---

### Task 6: Add reusable adaptive UI primitives

**Files:**
- Create: `packages/ui/src/primitives/advanced-disclosure.tsx`
- Create: `packages/ui/src/primitives/assistance-source.tsx`
- Create: `packages/ui/src/primitives/progress-meter.tsx`
- Create: `packages/ui/src/primitives/progress-meter.test.tsx`
- Modify: `packages/ui/src/index.ts`
- Modify: the UI stylesheet entry used by `@semogtw/ui`.

**Interfaces:**

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

Required copy mapping:

```text
manual                  → Inserido manualmente
deterministic_rule      → Calculado automaticamente
template                → Estrutura de modelo
external_ai_client      → Proposta de IA conectada
internal_model_provider → Proposta de IA configurada
```

`ProgressMeter` behavior:

- `value === null`: render `Progresso ainda não calculável`, no ARIA numeric value;
- numeric value: require finite `0..100`, render text and `role="progressbar"` with `aria-valuemin`, `aria-valuemax`, `aria-valuenow`;
- visual bar width may use a CSS custom property, not an inline unescaped style string from arbitrary input;
- status never relies on color alone.

- [ ] **Step 1: Write failing component tests**

```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { AssistanceSource, ProgressMeter } from "./index";

it("renders an indeterminate explanation without fake zero", () => {
  render(
    <ProgressMeter
      value={null}
      label="Progresso da meta"
      explanation="Adicione checkpoints ou uma regra mensurável."
    />,
  );
  expect(screen.getByText("Progresso ainda não calculável")).toBeTruthy();
  expect(screen.queryByRole("progressbar")).toBeNull();
});

it("labels a deterministic rule without mentioning AI", () => {
  render(
    <AssistanceSource
      origin={{
        kind: "deterministic_rule",
        ruleId: "growth.progress",
        ruleVersion: 1,
      }}
    />,
  );
  expect(screen.getByText("Calculado automaticamente")).toBeTruthy();
  expect(screen.queryByText(/IA/i)).toBeNull();
});
```

- [ ] **Step 2: Run and verify failure**

```bash
pnpm --filter @semogtw/ui exec vitest run src/primitives/progress-meter.test.tsx
```

Expected: FAIL because the primitives do not exist.

- [ ] **Step 3: Implement accessible components and styles**

Use semantic `<details>/<summary>` for `AdvancedDisclosure`; do not implement a custom inaccessible disclosure state machine.

- [ ] **Step 4: Run UI tests and typecheck**

```bash
pnpm --filter @semogtw/ui exec vitest run src/primitives/progress-meter.test.tsx
pnpm --filter @semogtw/ui typecheck
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/ui/src
git commit -m "feat: add adaptive owner UI primitives"
git push
```

---

### Task 7: Implement owner-only quick-create server flow

**Files:**
- Create: `apps/web/src/server/devos-growth-template-preview.ts`
- Create: `apps/web/src/server/devos-growth-quick-create.ts`
- Create: corresponding server tests following current `apps/web/src/server/*.test.ts` convention.
- Modify: the implemented Growth database composition module confirmed in Task 1.

**Interfaces:**

```ts
export const previewLearningGoalTemplateFn = createServerFn({ method: "GET" })
  .validator(
    z.object({
      templateId: z.enum([
        "learn_programming_language",
        "complete_course",
        "build_and_ship_project",
        "prepare_for_exam",
        "earn_credential",
      ]),
    }),
  )
  .handler(/* owner-only deterministic preview */);

export const quickCreateLearningGoalFn = createServerFn({ method: "POST" })
  .validator(
    z.object({
      csrfToken: z.string().min(1),
      idempotencyKey: z.string().uuid(),
      title: z.string().trim().min(1).max(160),
      targetDate: z.string().date().nullable(),
      motivation: z.string().trim().max(1000).nullable(),
      templateId: z
        .enum([
          "learn_programming_language",
          "complete_course",
          "build_and_ship_project",
          "prepare_for_exam",
          "earn_credential",
        ])
        .nullable(),
    }),
  )
  .handler(/* owner auth + canonical Growth service */);
```

- [ ] **Step 1: Write failing server tests**

Cover:

- unauthenticated preview fails before returning private configuration;
- preview returns only versioned deterministic template data;
- quick create rejects missing/invalid CSRF;
- same idempotency key and same payload returns the original result;
- same idempotency key and changed payload returns an idempotency conflict;
- no code path invokes a model/API/client;
- storage unavailable returns stable Portuguese copy without raw exception.

- [ ] **Step 2: Run and verify failure**

```bash
pnpm --filter @semogtw/web exec vitest run src/server/devos-growth-template-preview.test.ts src/server/devos-growth-quick-create.test.ts
```

Expected: FAIL.

- [ ] **Step 3: Implement owner authorization and service composition**

Reuse `requireMutationOwner()` and existing database composition. Generate audit/correlation IDs server-side. Do not accept `actorId`, provenance client IDs or percentage from the browser.

- [ ] **Step 4: Run focused tests**

```bash
pnpm --filter @semogtw/web exec vitest run src/server/devos-growth-template-preview.test.ts src/server/devos-growth-quick-create.test.ts
pnpm --filter @semogtw/web typecheck
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/server packages/database/src/composition
git commit -m "feat: add owner Growth quick-create handlers"
git push
```

---

### Task 8: Build the task-oriented Growth creation interface

**Files:**
- Create: `apps/web/src/components/devos/growth-quick-create.tsx`
- Create: `apps/web/src/components/devos/growth-template-picker.tsx`
- Create: `apps/web/src/components/devos/growth-checkpoint-builder.tsx`
- Create: component tests beside the components.
- Modify: `apps/web/src/routes/devos.growth.index.tsx`
- Modify: `apps/web/src/styles/growth.css`

**Interfaces:**

```tsx
export function GrowthQuickCreate(props: {
  csrfToken: string;
  templates: readonly {
    id: LearningGoalTemplateId;
    label: string;
    description: string;
  }[];
}): React.JSX.Element;
```

Normal flow fields:

```text
O que deseja alcançar?        required
Até quando?                    optional
Por que isso importa?          optional
Usar uma estrutura pronta?     optional
```

Primary actions:

```text
Criar meta
Visualizar estrutura
Cancelar
```

The normal flow must not ask for:

- slug/ID;
- status enum;
- priority unless the owner opens advanced settings later;
- checkpoint weight numbers;
- completion-mode JSON;
- evidence policy;
- MCP/client/provider metadata;
- arbitrary percentage.

- [ ] **Step 1: Write failing component tests**

Test that the four normal fields are present, technical fields are absent, template preview is clearly labeled `Estrutura de modelo`, submit creates a UUID idempotency key and a server validation error preserves valid input.

- [ ] **Step 2: Run and verify failure**

```bash
pnpm --filter @semogtw/web exec vitest run src/components/devos/growth-quick-create.test.tsx src/components/devos/growth-template-picker.test.tsx
```

Expected: FAIL.

- [ ] **Step 3: Implement the components**

Use the existing Button/Surface/Status language. Template preview must list exact checkpoints and automatic weights before submit.

- [ ] **Step 4: Implement responsive CSS**

Acceptance at 360 px:

- no horizontal overflow;
- labels remain visible;
- primary action is reachable without opening advanced settings;
- template cards become a single column;
- each touch target is at least 44 px;
- no table is used for the normal flow.

- [ ] **Step 5: Run tests/typecheck and commit**

```bash
pnpm --filter @semogtw/web exec vitest run src/components/devos/growth-quick-create.test.tsx src/components/devos/growth-template-picker.test.tsx
pnpm --filter @semogtw/web typecheck
git add apps/web/src/components/devos apps/web/src/routes/devos.growth.index.tsx apps/web/src/styles/growth.css
git commit -m "feat: add guided Growth quick creation"
git push
```

---

### Task 9: Add explainable progress and progressive advanced settings

**Files:**
- Create: `apps/web/src/components/devos/growth-progress-explanation.tsx`
- Create: `apps/web/src/components/devos/growth-advanced-settings.tsx`
- Create: component tests beside both files.
- Modify: `apps/web/src/routes/devos.growth.goals.$goalId.tsx`
- Modify: `apps/web/src/styles/growth.css`

**Interfaces:**

```tsx
export function GrowthProgressExplanation(props: {
  projection: GoalProgressProjection | null;
}): React.JSX.Element;

export function GrowthAdvancedSettings(props: {
  checkpoints: readonly {
    id: string;
    title: string;
    weight: number;
    weightMode: "automatic" | "custom";
    completionMode: CheckpointCompletionMode;
  }[];
  canRebalanceAutomatically: boolean;
}): React.JSX.Element;
```

Normal progress copy:

```text
65% — 3 de 5 checkpoints concluídos, considerando os pesos atuais.
```

Indeterminate copy:

```text
Progresso ainda não calculável.
Adicione checkpoints ou defina uma regra mensurável.
```

Expanded explanation includes each checkpoint title, ratio and weighted contribution. Do not expose internal row IDs in visible copy.

Advanced settings include:

- checkpoint weights and automatic/custom label;
- binary/numeric completion mode;
- numeric unit/target when applicable;
- deterministic `Redistribuir pesos` preview;
- canonical/MCP reference in a separate technical subsection;
- no model/API configuration.

- [ ] **Step 1: Write failing component tests**

Test numeric and indeterminate states, contribution sum, accessible progressbar attributes, collapsed advanced settings by default and confirmation requirement when custom weights would change.

- [ ] **Step 2: Run and verify failure**

```bash
pnpm --filter @semogtw/web exec vitest run src/components/devos/growth-progress-explanation.test.tsx src/components/devos/growth-advanced-settings.test.tsx
```

Expected: FAIL.

- [ ] **Step 3: Implement components with shared primitives**

Use `ProgressMeter`, `AdvancedDisclosure` and `AssistanceSource` from `@semogtw/ui`.

- [ ] **Step 4: Add the rebalance preview mutation through the existing Growth service**

The browser sends checkpoint IDs/current versions and the selected confirmation. The server recalculates the proposal; it never trusts client-computed weights as authoritative.

- [ ] **Step 5: Run focused tests/typecheck and commit**

```bash
pnpm --filter @semogtw/web exec vitest run src/components/devos/growth-progress-explanation.test.tsx src/components/devos/growth-advanced-settings.test.tsx
pnpm --filter @semogtw/domain test -- checkpoint-weights.test.ts progress.test.ts
pnpm --filter @semogtw/web typecheck
git add apps/web/src/components/devos apps/web/src/routes/devos.growth.goals.$goalId.tsx apps/web/src/styles/growth.css
git commit -m "feat: explain Growth progress and advanced settings"
git push
```

---

### Task 10: Verify no-AI behavior, mobile usability and confidentiality

**Files:**
- Create: `tests/e2e/growth-adaptive-owner-experience.spec.ts`
- Modify: `docs/testing/2026-08-03-growth-adaptive-owner-experience-test-matrix.md`
- Modify: `docs/LEARNING_GROWTH.md`
- Modify: `docs/DESIGN_SYSTEM.md`
- Modify: `CHANGELOG.md`

**Interfaces:**
- Consumes: complete Tasks 1–9.
- Produces: exact-head evidence that the owner flow works without AI and does not leak private/provenance state publicly.

- [ ] **Step 1: Write the E2E test**

The test must:

1. run with no internal model-provider configuration;
2. log in as owner;
3. open `/devos/growth` at 360×800;
4. create `Aprender Python para automação` from the programming-language template;
5. verify five checkpoint cards and exact automatic total `100`;
6. verify no control claims `Gerar com IA` is available;
7. open the goal and verify progress is `0%` only because measurable checkpoints now exist;
8. complete one 20-point checkpoint through the canonical mutation;
9. verify `20%` and the contribution explanation;
10. add a checkpoint and verify automatic rebalance preview;
11. customize one weight and verify later rebalance requires confirmation;
12. check there is no horizontal overflow;
13. sign out and prove `/devos/growth` redirects before private data loads;
14. request public routes and assert the goal title, template ID and assistance origin do not occur.

- [ ] **Step 2: Run the complete focused gate**

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

Expected: every observed result is recorded against the exact 40-character HEAD. Blocked browser/toolchain gates are classified and do not become claimed passes.

- [ ] **Step 3: Update documentation without duplicating the specs**

Document only:

- implemented routes/components;
- deterministic template IDs/version;
- observed tests;
- how the no-AI fallback behaves;
- links to the canonical adaptive-owner and Growth specifications.

Do not copy their full principles or formulas.

- [ ] **Step 4: Scan for false AI claims and placeholders**

```bash
rg -n "smart suggestion|sugestão inteligente|Gerar com IA|TODO|TBD|implement later|fill in" \
  packages apps tests docs/superpowers/plans/2026-08-03-semogtw-growth-adaptive-owner-experience.md
```

Expected: no ambiguous AI label and no unresolved plan placeholder. A legitimate unavailable label must explicitly say that an AI provider/client is not configured.

- [ ] **Step 5: Commit and push the closeout**

```bash
git add tests/e2e/growth-adaptive-owner-experience.spec.ts \
  docs/testing/2026-08-03-growth-adaptive-owner-experience-test-matrix.md \
  docs/LEARNING_GROWTH.md docs/DESIGN_SYSTEM.md CHANGELOG.md
git commit -m "test: verify adaptive Growth owner experience"
git push
```

## Acceptance criteria

This plan is complete only when:

- a goal can be created with title alone;
- a versioned template can be previewed and applied without any AI service;
- automatic integer weights always total exactly 100;
- custom weights are never silently overwritten;
- percentages are derived and explainable;
- an unmeasurable goal shows an indeterminate state rather than fake precision;
- normal UI avoids raw IDs, enums, formulas and schema-like tables;
- advanced settings remain discoverable and accessible;
- deterministic/template/manual/AI provenance labels are truthful;
- no AI button claims availability without a connected/configured model;
- owner-only, CSRF, idempotency, audit and conflict behavior pass;
- 360 px E2E and public-confidentiality checks pass;
- documentation references canonical specs instead of duplicating them.
