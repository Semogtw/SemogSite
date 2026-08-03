# SemogSite Agent Handoff

This file exists on the current stacked planning branch so agents see pending product decisions and execution order before changing overlapping areas.

## Current planning stack

```text
main
  → develop/remote-mcp-spark-planning
  → develop/learning-growth-spark-planning
  → develop/agent-editability-control-plane-spec
  → develop/agent-editability-implementation-plans
```

Always inspect the newest commits and open stacked pull requests before assuming a named branch contains every approved decision.

## Canonical designs in the parent branch

Before changing owner UX, MCP writes, agent permissions, Spark automation, Growth creation flows, percentages, templates, AI-assisted behavior, code execution or deployment control, review:

```text
docs/superpowers/specs/2026-08-03-semogtw-adaptive-owner-experience-design.md
docs/superpowers/specs/2026-08-03-semogtw-unified-editability-agent-control-design.md
docs/superpowers/specs/2026-08-03-semogtw-spark-email-event-wake-addendum.md
```

Canonical decisions include:

- normal DevOS use remains simple and complete without an AI provider;
- deterministic templates, defaults, weight distribution and percentages work without AI;
- personalized generation requires an authenticated external AI through MCP or an explicitly configured internal provider/model;
- UI and MCP mutations use the same canonical commands, with risk-based confirmation and approval;
- code and infrastructure changes use a separate Development Control Plane;
- a site-originated email may only wake a Spark Gmail monitor asynchronously;
- wake email content is untrusted transport data, never authorization, approval or canonical event payload;
- Spark retrieves the canonical event through authenticated MCP before acting;
- the email wake bridge is not real-time and is not used for critical or time-sensitive operations.

## Executable planning index

Read this file before implementing any part of the approved direction:

```text
docs/superpowers/plans/2026-08-03-semogtw-agent-editability-plan-stack.md
```

It defines the dependency order and hard gates for:

```text
adaptive Growth owner UX
Command Gateway and editability coverage
agent write authorization
approvals and change sets
operational domain UI/MCP write rollout
Growth domain UI/MCP write rollout
editorial and appearance UI/MCP write rollout
Development Requests
isolated development executor
merge, deployment health and rollback
```

Do not execute a later plan merely because its file exists. Authorization infrastructure alone does not make a domain editable: each domain rollout must inventory its supported mutations, migrate owner UI to canonical commands and prove filtered MCP parity. Remote MCP writes, critical actions, executor dispatch and deployment each have independent readiness gates.

## Documentation rule

Do not duplicate cross-cutting rules in new specs or plans.

Before adding documentation:

1. search the newest consolidated branch and open stacked PRs;
2. identify the canonical document for the concern;
3. update it or add a narrow linked extension;
4. keep dependent plans to short references;
5. distinguish approved design, planned implementation and observed code behavior.

## Implementation boundary

The current MCP rollout remains read-only until its OAuth, transport, isolation, revocation, backup and real-client acceptance gates pass. Future writes, internal model integration, Development Control Plane execution and the Spark email wake bridge remain separately gated. The executor requires a verified host-enforced sandbox; a plain Node child process is insufficient. Production deployment remains unavailable until the owner selects a host and a provider-specific adapter passes its own reviewed plan. Plans on this branch describe future implementation and do not make those capabilities implemented.