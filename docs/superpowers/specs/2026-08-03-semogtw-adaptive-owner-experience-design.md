# Semogtw Adaptive Owner Experience — Design Specification

**Status:** Approved design baseline  
**Date:** 2026-08-03  
**Repository:** `Semogtw/SemogSite`  
**Base:** descendant of `develop/agent-editability-control-plane-spec`

## 1. Decision

Semogtw DevOS must be easy to use directly by its owner even when no AI model, API key, Spark task, ChatGPT connection or external agent is available.

The private application will use an **adaptive, human-first experience**:

- common actions ask for the minimum information needed;
- deterministic defaults and calculations are applied automatically when safe;
- advanced controls remain available through progressive disclosure;
- complex internal identifiers, formulas and policy fields are not required during normal use;
- the interface presents goals, projects, evidence and progress as understandable workflows rather than spreadsheet-like record editing;
- AI-assisted generation is optional and clearly separated from deterministic product behavior.

The canonical separation is:

```text
Always available
  human UI + deterministic rules + templates + calculations

Available when an external AI client is connected
  AI reasons in ChatGPT/Spark/Claude/local client
  → calls bounded MCP commands/change sets
  → DevOS validates, previews and applies

Available only when an internal model provider is configured
  DevOS invokes a configured API or local model adapter
  → generated proposal
  → same validation/preview/command path
```

The site never presents generated intelligence as available when no model actually participated.

## 2. Canonical ownership and non-duplication

This specification is the canonical source for:

- owner-facing ease of use;
- progressive disclosure;
- quick creation and guided flows;
- deterministic assistance and smart defaults;
- distinction between deterministic, external-MCP and internal-model assistance;
- presentation and explanation of derived percentages;
- avoidance of spreadsheet-like interaction;
- graceful degradation when AI providers are unavailable;
- documentation de-duplication rules for interaction design.

Other documents retain narrower ownership:

- platform foundation: visual identity, tokens, components and broad responsive shell;
- Growth specification: canonical goal/checkpoint/evidence model and progress formula;
- unified editability specification: command gateway, UI/MCP parity, risk and approvals;
- domain specifications: lifecycle, persistence and business invariants;
- implementation plans: exact files, sequencing, commands and observed tests.

Other specs and plans should link to this document instead of copying its general UX principles.

## 3. Product principles

1. The normal flow must work without an AI provider.
2. The owner should not need to understand the database model to create useful records.
3. Required fields are minimized; optional detail can be added later.
4. Safe deterministic defaults are preferred over blank technical configuration.
5. Derived values are calculated automatically and explained clearly.
6. The interface must distinguish facts, deterministic calculations, templates and AI-generated proposals.
7. AI output enters the same validated command/change-set path as human input.
8. AI unavailability must not remove core CRUD and workflow capability.
9. Dense tables are an advanced representation, not the default interaction model.
10. Every automation must expose what caused it and how to correct it.
11. Common actions should complete in a small number of focused steps.
12. Advanced configuration is discoverable but does not dominate normal screens.
13. Mobile use is a first-class workflow, not a read-only fallback.
14. Documentation must be searched before new UX rules are added elsewhere.

## 4. Assistance modes

### 4.1 Deterministic assistance

Deterministic assistance is part of the product and needs no AI.

Examples:

- distribute checkpoint weights equally;
- redistribute weights after a checkpoint is added or removed;
- calculate progress percentages from canonical inputs;
- derive credential expiry state from dates;
- choose the first incomplete checkpoint as the next checkpoint;
- calculate due/overdue groupings;
- suggest a default ordering defined by a selected template;
- generate canonical slugs and identifiers invisibly;
- detect missing required information;
- show conflicts, duplicates and stale versions;
- offer known templates for common record types;
- preserve and restore drafts locally/server-side according to the final implementation plan.

These results must be reproducible from the same inputs. They are labeled as automatic calculations or defaults, not as AI suggestions.

### 4.2 External AI through MCP

An external AI may use SemogSite through MCP without the site owning an AI API key.

Example:

```text
Owner in Spark:
  “Create a practical plan for learning Java APIs.”

Spark:
  reads allowed context
  creates a structured goal/checkpoint change set

DevOS:
  validates fields, permissions, risk and versions
  shows a preview when required
  applies the canonical commands
```

Rules:

- the external client performs the generative reasoning;
- the site does not assume which model/provider produced the proposal;
- proposed output is validated like any other untrusted input;
- provenance identifies the authenticated MCP client and declared provider/model when supplied;
- the UI shows that the structure came from an AI client;
- manual editing remains available before and after application;
- unavailable MCP clients do not degrade the normal site workflow.

### 4.3 Internal AI provider

Internal generation is optional and disabled until an owner configures a supported provider or local-model adapter.

Potential provider types:

```text
Hosted API adapter
Local model adapter
Remote owner-managed agent adapter
```

The implementation must not assume that a ChatGPT or Google consumer subscription automatically supplies an API.

When no provider is configured:

- no request is sent;
- no fake AI result is produced;
- generation buttons are hidden or shown as unavailable with a direct configuration explanation;
- deterministic templates and manual creation remain fully functional.

When configured:

- generated content is a proposal, not canonical truth;
- provider credentials remain server-side and are never exposed to browser/MCP output;
- model output uses bounded schemas and the canonical command/change-set flow;
- usage, cost and provider failures are visible at an appropriate level;
- disabling the provider immediately restores deterministic-only behavior.

## 5. Creation model

### 5.1 Quick creation

Common creation begins with a short, focused entry point.

A learning goal may initially ask:

```text
What do you want to achieve?        required
Target date                         optional
Why is it important?                optional
```

A project may initially ask:

```text
Name                                required
Outcome or summary                  optional
Priority                            sensible default
```

A credential may initially ask:

```text
Title                               required
Issuer                              required
Issue date                          optional
Verification link                   optional
```

The first successful save creates a valid draft or active entity according to the domain rule. Additional technical detail is not required merely because it exists in the schema.

### 5.2 Guided enrichment

After creation, the interface may offer deterministic next actions such as:

- add the first checkpoint;
- select a template;
- link an existing skill;
- attach evidence;
- define a target date;
- review automatically distributed weights;
- connect a repository;
- import normalized credential metadata.

These prompts come from explicit product rules and entity state, not an implicit AI model.

### 5.3 Templates

Templates are versioned deterministic structures.

Possible examples:

```text
Learn a programming language
Complete a course
Build and ship a project
Prepare for an exam
Earn a credential
Publish an article
```

A template may define:

- suggested checkpoint titles;
- default ordering;
- equal or predefined weights;
- optional fields;
- expected evidence categories;
- display copy and help text.

Templates do not claim personalization. Applying one shows the exact proposed structure before creation when material.

### 5.4 AI-assisted creation

When an AI client/provider is available, the owner may use natural language to create a more personalized proposal.

The result must be shown as one of:

```text
Generated by connected MCP client
Generated by configured internal provider
```

The system must not label deterministic template application as AI-generated.

## 6. Progressive disclosure

Normal screens show the fields and actions needed for the current task.

Advanced sections may contain:

- checkpoint weights;
- numeric completion rules;
- evidence acceptance policies;
- canonical IDs and MCP references;
- optimistic version details;
- source freshness;
- agent permissions;
- integration metadata;
- audit/event history;
- raw but allowlisted technical observations;
- configuration reset and migration diagnostics.

Rules:

- advanced controls are grouped by purpose, not exposed as a raw schema dump;
- opening an advanced section must not change state;
- defaults remain visible in plain language;
- destructive or high-risk controls remain explicit even when advanced sections are collapsed;
- the owner may opt into an expert view, but expert view is not the default for new users/sessions unless saved as a preference;
- field labels use user language, with technical identifiers secondary.

## 7. Automatic percentages and derived values

### 7.1 Canonical rule

Percentages are calculated automatically whenever the domain has sufficient deterministic inputs.

For Growth, the formula remains owned by the Growth specification. This document owns how the result is presented and configured.

Example:

```text
Fundamentals       completed, weight 20       → 20
Exercises          5 / 10, weight 30          → 15
Final project      completed, weight 50       → 50

Goal progress                                  85%
```

### 7.2 Default weighting

When checkpoints are created without explicit weights:

- the system assigns an equal deterministic distribution;
- integer rounding must preserve an exact total according to a documented rule;
- the UI explains that weights were distributed automatically;
- the owner can accept, adjust manually or request redistribution;
- adding/removing checkpoints does not silently rewrite accepted custom weights without confirmation.

Possible safe behavior:

```text
All weights are still automatic
  → redistribute automatically

One or more weights were customized
  → preview redistribution and ask
```

### 7.3 Explanation

The normal view shows concise reasoning:

```text
65% — 3 of 5 checkpoints completed, adjusted by their current weights.
```

An expanded explanation shows each contribution.

The system must not show a precise percentage when inputs are insufficient. It instead shows a meaningful state:

```text
Progress cannot be calculated yet.
Add checkpoints or define a measurable completion rule.
```

### 7.4 Editable inputs, not arbitrary output

The owner and authorized AI clients can edit:

- checkpoints;
- weights;
- numeric targets;
- accepted values through valid commands;
- evidence links and decisions;
- waiver/cancellation state under domain policy.

They do not directly overwrite a derived percentage unless a future domain explicitly defines a canonical manual-progress mode with clear semantics. No such generic override is approved here.

## 8. Interaction language

The primary interface should feel like managing goals and work, not editing rows.

Preferred patterns:

- cards with clear status and next action;
- checklists;
- progress bars/rings with text equivalents;
- timelines and activity streams;
- guided forms;
- quick-add controls;
- inline edits for low-risk simple fields;
- dedicated detail pages for structural changes;
- contextual actions such as Complete, Pause, Add evidence and Review proposal;
- previews for multi-entity changes;
- useful empty states with one primary next action.

Dense tables are appropriate for:

- audit review;
- large comparisons;
- bulk administration;
- technical operations;
- export-oriented views;
- advanced filtering where cards would reduce clarity.

Even there, responsive alternatives and detail views are required.

## 9. Form behavior

### 9.1 Defaults

Defaults must be:

- deterministic;
- documented;
- safe;
- visible in human language;
- easy to override;
- stable across UI and MCP command schemas.

Examples:

- medium priority for a normal new goal/project;
- draft state when publication or external visibility is involved;
- equal weights for new checkpoints;
- no target date rather than an invented deadline;
- owner review required for untrusted evidence;
- private visibility unless explicitly changed.

### 9.2 Validation

Validation should happen as close to the field/action as practical.

The UI:

- preserves valid input after an error;
- explains how to fix the problem;
- avoids exposing internal error codes as the only message;
- maps stable server errors to human copy;
- never silently drops fields;
- shows version conflicts as a comparison/reload choice rather than generic failure.

### 9.3 Drafts and abandonment

Implementation plans must choose a consistent draft strategy for long forms.

Acceptable behavior includes:

- explicit Save draft;
- safe autosave for draft-only low-risk data;
- local unsaved-change recovery;
- navigation warning where loss is possible.

Autosave must never execute high/critical actions or publication/deployment commands.

## 10. AI affordances and provenance

Every AI-dependent action declares its source and availability.

Possible labels:

```text
Use connected AI
Generate with configured AI
Ask an AI through MCP
Review AI proposal
```

The interface must avoid ambiguous labels like `Smart suggestion` when the source could be a deterministic rule.

Each proposal records/show as appropriate:

- deterministic rule/template version, or authenticated AI client/provider;
- generation timestamp;
- source context scope;
- whether external data may be stale;
- confidence only as advisory metadata;
- changes that will be applied;
- required confirmation/approval.

AI output is never proof of completion, verification or correctness by itself.

## 11. Graceful degradation

### No AI connected

The owner can still:

- create/edit/archive/restore modeled entities;
- use templates;
- calculate progress;
- manage checkpoints and weights;
- enter evidence and credentials manually;
- publish through the normal reviewed workflow;
- use every deterministic feature.

### MCP client unavailable

Pending canonical state remains intact. The site does not wait indefinitely or lose drafts.

### Internal provider unavailable

Generation returns a bounded provider-unavailable state. Manual/template flows remain visible and unchanged.

### Provider response invalid

The proposal is rejected or shown as invalid without partial canonical writes. Raw provider errors and secrets are not exposed.

### External observations stale

The UI labels them stale/unknown and avoids presenting inferred updates as current facts.

## 12. Mobile behavior

At compact widths:

- quick creation remains available without horizontal scrolling;
- the primary action and current status appear early;
- large forms are split into focused steps or sections;
- advanced controls use disclosures or dedicated pages;
- tables convert to cards or a detail-first flow;
- progress explanations remain readable;
- touch targets meet the platform foundation minimum;
- dialogs do not trap essential information below the viewport;
- AI/provider configuration is not required to complete ordinary tasks.

## 13. Accessibility

- status is not communicated by color alone;
- percentages have text equivalents;
- progress elements expose accessible names and values;
- generated/deterministic provenance is available to assistive technology;
- validation errors are associated with fields;
- focus moves predictably after create/save/error;
- disclosures announce expanded state;
- keyboard use supports every owner action;
- reduced-motion preferences are respected;
- content remains understandable without charts.

## 14. Relationship to UI/MCP parity

The unified editability specification defines that UI and MCP call the same canonical commands.

This specification adds a separate requirement:

> Command parity must not force the human UI to expose raw command schemas.

The UI may transform a simple human interaction into one or more canonical commands while preserving:

- validation;
- risk classification;
- previews;
- expected versions;
- audit;
- deterministic defaults;
- final canonical result.

Likewise, MCP discovery may expose structured technical schemas while the human UI remains guided and task-oriented.

A feature is incomplete when:

- MCP can perform it but the owner UI requires manual database-like field entry;
- the owner can perform it only through an AI;
- an automatic value has no explanation or correction path;
- the UI claims an AI capability without a configured/connected model;
- advanced configuration is the only creation path for a common task.

## 15. Documentation non-duplication protocol

Before creating or materially extending a design/specification/plan, the agent must search the newest consolidated branch for:

```text
feature/domain name
route/tool/command names
core concepts and synonyms
existing specs/plans/indexes
README, DATA_MODEL, MCP, SECURITY and TESTING documents
```

Then it must classify the change:

```text
Update canonical document
Add a narrow extension that links to the canonical document
Create a new canonical document because the concern is genuinely separate
Mark an older document historical/superseded
```

Rules:

- one canonical document owns each cross-cutting rule;
- indexes identify canonical ownership;
- dependent documents summarize in at most a short paragraph and link;
- implementation plans reference design rules instead of restating them at length;
- copied text must be removed when a new canonical source supersedes it;
- conflicting statements are resolved in the same documentation change;
- historical documents remain clearly labeled and are not silently treated as executable;
- documentation-only commits must distinguish planned from implemented behavior;
- future agents must record which documents were searched before adding a new one.

A documentation coverage check should eventually report duplicate headings/key phrases and broken canonical links, but initial enforcement can be review/agent checklist based.

## 16. Testing strategy

### Deterministic behavior

- equal-weight distribution is reproducible and sums correctly;
- redistribution respects customized weights and confirmation rules;
- derived percentages match canonical formulas;
- insufficient inputs show non-numeric states;
- templates are versioned and deterministic;
- deterministic outputs are not labeled as AI.

### Human flows

- common entities can be created with minimal required fields;
- optional details can be added later;
- advanced controls are not required for normal success;
- field validation preserves input;
- version conflicts produce understandable recovery;
- drafts/unsaved changes follow the chosen policy;
- high/critical actions cannot be autosaved/executed implicitly.

### AI availability

- no configured provider means no internal generation request;
- no connected client does not break normal flows;
- invalid model output cannot partially mutate canonical data;
- AI provenance appears on proposals;
- deterministic and AI-generated proposals are visually/textually distinct;
- provider disablement restores deterministic-only behavior.

### Visual and accessibility

- card/checklist/detail patterns on desktop and 360 px;
- no unintended horizontal overflow;
- keyboard and screen-reader interaction;
- progress text equivalents;
- accessible validation and disclosures;
- dense tables only where justified, with compact fallback.

### Documentation

- canonical links resolve;
- new plans reference this spec for human UX rules;
- no competing adaptive-owner UX spec exists;
- planned/implemented status is explicit;
- search-before-write evidence appears in plan/session handoff.

## 17. Delivery decomposition

This specification requires later implementation planning but does not itself authorize code.

Suggested independent plan slices:

### Phase A — Owner experience primitives

- quick-create shell;
- progressive disclosure primitives;
- deterministic default/provenance presentation;
- form validation/conflict/draft patterns;
- adaptive card/checklist/detail layouts.

### Phase B — Deterministic assistance services

- template registry;
- weight distribution/redistribution;
- explanation DTOs;
- next-action rules;
- assistance provenance contract.

### Phase C — Domain adoption

Apply the primitives to:

- projects/roadmap/attention;
- Growth/checkpoints/evidence/credentials;
- editorial workflows;
- workflow/agent administration;
- appearance/configuration.

### Phase D — External AI UX

- connected-client status;
- MCP proposal provenance;
- change-set review entry points;
- handoff/open-client affordances where provider APIs permit.

### Phase E — Optional internal AI

Only after a separate provider/secret/cost/privacy design:

- provider adapter contract;
- configuration UI;
- bounded generation schemas;
- cost/rate/failure visibility;
- disablement and fallback.

### Phase F — Documentation governance

- canonical ownership map;
- search-before-write checklist;
- optional duplicate-link/content scanner;
- plan and handoff templates updated.

## 18. Acceptance criteria

The adaptive owner experience is complete only when:

- core use remains complete with every AI/provider disabled;
- common creation flows require only essential fields;
- deterministic defaults reduce configuration without hiding consequences;
- percentages and other derived values update automatically when inputs permit;
- every automatic value has an understandable explanation and correction path;
- advanced options are available but not required for common tasks;
- the default interface uses task-oriented cards, checklists, timelines and guided forms rather than database-like tables;
- AI-dependent controls accurately reflect connection/configuration state;
- external AI via MCP and optional internal AI produce proposals through the same canonical command path;
- provenance distinguishes templates/rules from AI output;
- mobile and accessibility tests pass;
- every related plan references this specification instead of duplicating its cross-cutting rules;
- future documentation additions demonstrate a search of the newest consolidated branch before creating overlapping guidance.
