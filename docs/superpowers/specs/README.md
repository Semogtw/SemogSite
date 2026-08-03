# SemogSite Design Specifications

This directory contains approved product and architecture specifications. Specifications define decisions and invariants; executable task sequencing lives in [`../plans/README.md`](../plans/README.md).

Agents must verify the newest consolidated branch and current code before applying a specification. A specification may describe future work that is not implemented yet.

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
- a search-before-write and canonical-document protocol to prevent duplicated or conflicting documentation.

The platform foundation continues to own visual tokens/components, Growth owns the progress formula and domain semantics, and the unified editability specification owns command/risk/UI-MCP parity. Dependent documents should link here rather than restating general human-experience rules.

No implementation plan exists yet. Plans must be written only after owner review of this specification.

## Unified editability and agent control direction

### UI/MCP parity, graduated authorization and development control

- [`2026-08-03-semogtw-unified-editability-agent-control-design.md`](./2026-08-03-semogtw-unified-editability-agent-control-design.md)

Defines the long-term product invariant that every meaningful private operation has both an owner UI workflow and an authorized AI/MCP workflow using the same canonical command.

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
- owner editing and MCP action discovery governed by the adaptive owner-experience design;
- modeled theme/navigation/dashboard configuration without executable-code injection;
- a separate Development Control Plane for code, migrations, tests, branches, merge, deployment and rollback;
- an isolated executor rather than generic SQL, shell or arbitrary-file tools for normal clients.

“Everything editable” does not authorize direct mutation of derived fields, immutable history, external observations or secret readback. It guarantees a controlled workflow for achieving the intended state.

No implementation plan exists yet. Plans must be written only after the owner reviews this specification.

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
- Gmail/Spark extraction as normalized proposals without Gmail credentials/raw mailbox bodies in DevOS;
- six future Growth MCP read tools;
- future Growth writes governed by the unified editability/agent-control design and its post-read security gates;
- Spark recipes for planning, GitHub evidence review, certificate previews and recurring briefings.

The Growth data model/formula remain canonical here; quick creation, automatic presentation, progressive disclosure and AI-availability behavior are governed by the adaptive owner-experience specification.

Executable plans:

- [`../plans/2026-08-03-semogtw-learning-goals-core.md`](../plans/2026-08-03-semogtw-learning-goals-core.md)
- [`../plans/2026-08-03-semogtw-learning-evidence-credentials.md`](../plans/2026-08-03-semogtw-learning-evidence-credentials.md)
- [`../plans/2026-08-03-semogtw-learning-mcp-spark-automation.md`](../plans/2026-08-03-semogtw-learning-mcp-spark-automation.md)

The Growth core is useful without Spark or a remote MCP endpoint. External clients provide observations/proposals; DevOS remains canonical.

## Current remote MCP direction

### Remote MCP and Gemini Spark integration

- [`2026-08-03-semogtw-remote-mcp-spark-design.md`](./2026-08-03-semogtw-remote-mcp-spark-design.md)

Defines:

- Mode B external MCP bridge;
- `packages/mcp-auth` and migration `0014_mcp_oauth.sql`;
- preregistration and Dynamic Client Registration;
- authorization code + PKCE S256;
- digest-only opaque access/refresh tokens, rotation and revocation;
- private owner client management and consent;
- authenticated stateless Streamable HTTP;
- Gemini Spark as an optional compatibility target;
- six later workflow/recovery read tools;
- a read-first implementation sequence before any write rollout.

Executable plans:

- [`../plans/2026-08-03-semogtw-remote-mcp-spark.md`](../plans/2026-08-03-semogtw-remote-mcp-spark.md)
- [`../plans/2026-08-03-semogtw-workflow-mcp-read-catalog.md`](../plans/2026-08-03-semogtw-workflow-mcp-read-catalog.md)

The existing remote implementation plans remain read-only. Long-term write behavior is governed by the unified editability/agent-control specification and requires separate implementation plans after the remote read gates pass.

### Spark email event wake bridge

- [`2026-08-03-semogtw-spark-email-event-wake-addendum.md`](./2026-08-03-semogtw-spark-email-event-wake-addendum.md)

This narrow addendum defines an optional asynchronous adapter in which SemogSite sends a minimal email that matches a Spark Gmail monitor. The email contains only an opaque event reference; Spark must retrieve the canonical event through authenticated MCP before analysis or action.

It defines:

- a provider-neutral event-wake outbox and lifecycle;
- minimal non-authoritative email envelopes;
- explicit prompt-injection, replay, duplicate and feedback-loop controls;
- no real-time or delivery guarantee;
- read-only experimental rollout before any supervised lifecycle writes;
- future idempotent claim/complete commands behind the unified write gates;
- direct webhook/provider adapters as a future replacement without changing domain contracts.

The addendum does not modify the current remote MCP implementation plan. It requires account-level verification of Gmail monitor behavior, custom-app availability, latency and write confirmation before any implementation plan is created.

The historical 2026-08-01 Streamable HTTP plan is not the current execution source.

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
- Do not mark a future design as implemented merely because the specification exists.
- Before creating a specification or plan, search the newest consolidated branch for the domain, routes, tools, commands, concepts and synonyms.
- Prefer updating a canonical document or adding a short linked extension over duplicating cross-cutting requirements.
- Provider availability, plans, regions and client behavior are external dependencies and must be reverified.
- Preserve provider-neutral domain contracts; provider-specific compatibility belongs in adapters/evidence.
- External observations and model classifications are data/proposals, never canonical completion by themselves.
- Deterministic assistance must not be presented as AI; internal generation requires a configured model/provider and external generation requires an authenticated connected client.
- Broad editability must use canonical commands, graduated authorization and owner-visible audit; it must not become arbitrary raw access.
- Security-sensitive surfaces require dedicated implementation plans, tests, preview evidence and rollback.
- Update the relevant specification only when an architectural decision changes; implementation progress belongs in plans, test matrices, runbooks and changelog.
