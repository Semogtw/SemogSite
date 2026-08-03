# SemogSite Agent Handoff

This file exists on the consolidated development-planning branch so agents see pending product decisions before changing overlapping areas.

## Current consolidated branch

The current consolidated planning baseline is:

```text
develop/learning-growth-spark-planning
```

Always inspect the newest commits and open stacked pull requests before assuming this branch contains every approved design decision.

## Pending canonical design work

PR #22, branch `develop/agent-editability-control-plane-spec`, contains approved design direction that is not yet merged into this branch and is not implemented code.

Before changing owner UX, MCP writes, agent permissions, Spark automation, Growth creation flows, percentages, templates, or AI-assisted behavior, review these documents in PR #22:

```text
docs/superpowers/specs/2026-08-03-semogtw-adaptive-owner-experience-design.md
docs/superpowers/specs/2026-08-03-semogtw-unified-editability-agent-control-design.md
docs/superpowers/specs/2026-08-03-semogtw-spark-email-event-wake-addendum.md
```

Canonical decisions include:

- normal DevOS use must remain simple and complete without any AI provider;
- deterministic templates, defaults, weight distribution and percentages are available without AI;
- personalized generation requires an authenticated external AI through MCP or an explicitly configured internal provider/model;
- UI and MCP mutations ultimately use the same canonical commands, with risk-based confirmation and approval;
- code and infrastructure changes use a separate development control plane;
- a site-originated email may only wake a Spark Gmail monitor asynchronously;
- wake email content is untrusted transport data, never authorization, approval or canonical event payload;
- Spark must retrieve the canonical event through authenticated MCP before acting;
- the email wake bridge is not real-time and must not be used for critical or time-sensitive operations.

## Documentation rule

Do not duplicate these cross-cutting rules in new specs or plans.

Before adding documentation:

1. search the newest consolidated branch and open stacked PRs;
2. identify the canonical document for the concern;
3. update it or add a narrow linked extension;
4. keep dependent plans to short references;
5. distinguish approved design, planned implementation and observed code behavior.

## Implementation boundary

Do not treat PR #22 as implemented functionality. The current MCP rollout remains read-only until its existing OAuth, transport, isolation, revocation, backup and client-acceptance gates pass. Future writes, internal model integration and the Spark email wake bridge require separate executable plans and fresh owner approval at their implementation gates.
