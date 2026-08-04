# SemogSite Design Specifications

This directory contains approved product and architecture specifications. Specifications define decisions and invariants; executable sequencing and observed implementation evidence live under [`../plans/README.md`](../plans/README.md) and `docs/testing`.

Agents must verify the newest consolidated branch and current code before applying a specification. A specification may describe later phases even when an initial foundation is already implemented.

## Current design and implementation stack

The active stack is indexed at:

- [`../plans/2026-08-03-semogtw-agent-editability-plan-stack.md`](../plans/2026-08-03-semogtw-agent-editability-plan-stack.md)

Current implementation plan:

- [`../plans/2026-08-03-semogtw-command-gateway-editability-foundation.md`](../plans/2026-08-03-semogtw-command-gateway-editability-foundation.md)

Current evidence:

- [`../../testing/2026-08-04-command-gateway-progress.md`](../../testing/2026-08-04-command-gateway-progress.md)

The current stacked branch contains the private adaptive Growth core and Command Gateway foundation. Their exact-head gates remain pending; presence of code is not verification or merge authorization.

## Adaptive owner experience direction

### Human-first workflows, deterministic assistance and optional AI

- [`2026-08-03-semogtw-adaptive-owner-experience-design.md`](./2026-08-03-semogtw-adaptive-owner-experience-design.md)

This is the canonical source for owner-facing ease of use. It defines:

- minimal quick-create flows and progressive disclosure;
- deterministic templates, defaults, weight distribution and calculations that work without AI;
- automatic, explainable percentages derived from canonical domain inputs;
- task-oriented cards, checklists, timelines and guided forms rather than spreadsheet-like record editing;
- explicit separation between deterministic assistance, external AI through MCP and optional internal model providers;
- truthful AI availability/provenance and complete manual fallbacks;
- mobile/accessibility requirements;
- a search-before-write and canonical-document protocol.

Executable plans now exist:

- [`../plans/2026-08-03-semogtw-growth-adaptive-owner-experience.md`](../plans/2026-08-03-semogtw-growth-adaptive-owner-experience.md)
- [`../plans/2026-08-03-semogtw-learning-goals-core.md`](../plans/2026-08-03-semogtw-learning-goals-core.md)

PR #24 implements the initial private Growth/adaptive-owner slice, including quick creation, deterministic templates, derived progress and server-derived weight rebalance. Its current head is not verified.

The platform foundation continues to own visual tokens/components, Growth owns the progress formula and domain semantics, and unified editability owns command/risk/UI-MCP parity.

## Unified editability and agent control direction

### UI/MCP parity, graduated authorization and development control

- [`2026-08-03-semogtw-unified-editability-agent-control-design.md`](./2026-08-03-semogtw-unified-editability-agent-control-design.md)

Defines the long-term invariant that every meaningful private operation has both an owner UI workflow and an authorized AI/MCP workflow using the same canonical command.

The design includes:

- a framework-free command catalog and command gateway shared by UI, API, MCP and internal jobs;
- per-feature editability manifests and a completeness gate;
- low, medium, high and critical risk levels;
- direct execution, client confirmation, prepared approval and recent-auth DevOS approval dispositions;
- reusable agent profiles, capabilities and resource-level grants;
- self-escalation prevention, temporary trust sessions and independent write kill switches;
- immutable approval requests bound to payload hashes, entity versions and exact SHAs;
- atomic database change sets and explicit cross-system saga/compensation behavior;
- command-specific correction, compensation, rotation and rollback rather than arbitrary history rewriting;
- owner editing and action discovery governed by the adaptive-owner design;
- modeled theme/navigation/dashboard configuration without executable-code injection;
- a separate Development Control Plane for code, migrations, tests, branches, merge, deployment and rollback;
- an isolated executor rather than generic SQL, shell or arbitrary-file tools.

“Everything editable” does not authorize direct mutation of derived fields, immutable history, external observations or secret readback. It guarantees a controlled workflow for achieving intended state.

Executable plan stack now exists:

- [`../plans/2026-08-03-semogtw-agent-editability-plan-stack.md`](../plans/2026-08-03-semogtw-agent-editability-plan-stack.md)
- [`../plans/2026-08-03-semogtw-command-gateway-editability-foundation.md`](../plans/2026-08-03-semogtw-command-gateway-editability-foundation.md)
- [`../plans/2026-08-03-semogtw-agent-write-authorization.md`](../plans/2026-08-03-semogtw-agent-write-authorization.md)
- [`../plans/2026-08-03-semogtw-approvals-change-sets.md`](../plans/2026-08-03-semogtw-approvals-change-sets.md)
- concrete operational, Growth, editorial/appearance and development/deployment rollout plans linked from the stack index.

PR #26 implements only the Command Gateway foundation slice. It does not implement agent grants, remote writes, immutable approvals, change sets, development executor or deployment control.

## Learning and growth direction

### Learning, Growth, Evidence and Credentials

- [`2026-08-03-semogtw-learning-growth-evidence-design.md`](./2026-08-03-semogtw-learning-growth-evidence-design.md)

Defines:

- a private provider-neutral Growth domain;
- learning goals, ordered weighted checkpoints and private skills;
- progress derived from checkpoint state rather than directly assigned percentages;
- evidence candidates, explicit claims, owner review and deterministic source policies;
- exact GitHub observation references without treating commits as proof of comprehension;
- certificate/credential metadata, verification states and optional private attachment references;
- Gmail/Spark extraction as normalized proposals without mailbox credentials/raw bodies in DevOS;
- future Growth MCP reads and supervised writes governed by unified editability.

Executable plans:

- [`../plans/2026-08-03-semogtw-learning-goals-core.md`](../plans/2026-08-03-semogtw-learning-goals-core.md)
- [`../plans/2026-08-03-semogtw-learning-evidence-credentials.md`](../plans/2026-08-03-semogtw-learning-evidence-credentials.md)
- [`../plans/2026-08-03-semogtw-learning-mcp-spark-automation.md`](../plans/2026-08-03-semogtw-learning-mcp-spark-automation.md)
- [`../plans/2026-08-03-semogtw-growth-domain-write-rollout.md`](../plans/2026-08-03-semogtw-growth-domain-write-rollout.md)

The initial goal/checkpoint core is present in PR #24. Evidence/credentials, Growth MCP reads and supervised write parity remain separate phases.

## Remote MCP direction

### Authenticated remote MCP and Gemini Spark compatibility

- [`2026-08-03-semogtw-remote-mcp-spark-design.md`](./2026-08-03-semogtw-remote-mcp-spark-design.md)

Defines:

- Mode B external MCP bridge;
- `packages/mcp-auth` and planned migration `0014_mcp_oauth.sql`;
- preregistration and Dynamic Client Registration;
- authorization code + PKCE S256;
- digest-only opaque access/refresh tokens, rotation and revocation;
- private owner client management and consent;
- authenticated stateless Streamable HTTP;
- Gemini Spark as an optional compatibility target;
- read-first implementation before any write rollout.

Executable plans:

- [`../plans/2026-08-03-semogtw-remote-mcp-spark.md`](../plans/2026-08-03-semogtw-remote-mcp-spark.md)
- [`../plans/2026-08-03-semogtw-workflow-mcp-read-catalog.md`](../plans/2026-08-03-semogtw-workflow-mcp-read-catalog.md)

The current in-process MCP remains read-only and is not a remote authenticated endpoint. Long-term writes require the remote read gates plus Command Gateway, agent authorization and concrete domain rollout.

### Spark email event wake bridge

- [`2026-08-03-semogtw-spark-email-event-wake-addendum.md`](./2026-08-03-semogtw-spark-email-event-wake-addendum.md)

This optional adapter sends only an opaque event reference by email; Spark must retrieve canonical state through authenticated MCP. It remains design/readiness guidance. No implementation plan should be created until the owner account demonstrates Gmail monitor, custom MCP app behavior, latency, duplicate and confirmation semantics.

## Workflow and continuity specifications

### Workflow orchestration core

- [`2026-08-03-workflow-orchestration-core-design.md`](./2026-08-03-workflow-orchestration-core-design.md)

Provider-neutral scope reservations, exact-SHA verification obligations, immutable recovery snapshots and conservative safe-work evaluation.

### Provider-agnostic project session resume

- [`2026-08-02-provider-agnostic-project-resume-design.md`](./2026-08-02-provider-agnostic-project-resume-design.md)

Conservative activity classification, trustworthy continuation context and clipboard/open-destination behavior without provider UI scraping or automatic submission.

## Platform specification

### Platform foundation

- [`2026-08-01-semogtw-platform-foundation-design.md`](./2026-08-01-semogtw-platform-foundation-design.md)

Portable TypeScript platform, public/editorial site, private DevOS, relational persistence, authentication and adapter boundaries.

Editorial lifecycle and redirect execution documents currently live under [`../plans/README.md`](../plans/README.md); do not invent specification links for plan-only files.

## Specification rules

- Code and observed tests remain the source of truth for implementation state.
- Do not mark a future design as implemented merely because its specification or plan exists.
- Before creating a specification or plan, search the newest consolidated branch for the domain, routes, tools, commands, concepts and synonyms.
- Prefer updating a canonical document or adding a short linked extension over duplicating cross-cutting requirements.
- Provider availability, plans, regions and client behavior are external dependencies and must be reverified.
- Preserve provider-neutral domain contracts; provider-specific compatibility belongs in adapters/evidence.
- External observations and model classifications are data/proposals, never canonical completion by themselves.
- Deterministic assistance must not be presented as AI; internal generation requires a configured model/provider and external generation requires an authenticated connected client.
- Broad editability must use canonical commands, graduated authorization and owner-visible audit; it must not become arbitrary raw access.
- Security-sensitive surfaces require dedicated implementation plans, tests, preview evidence and rollback.
- Update a specification only when an architectural decision changes; implementation progress belongs in plans, test matrices, runbooks and changelog.
