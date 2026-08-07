# Semogtw Agent Editability Implementation Stack

> **For agentic workers:** This is the execution index for the specifications on `develop/agent-editability-control-plane-spec`. Read the referenced specification and the individual implementation plan before changing code. Do not skip hard gates.

## Goal

Turn the approved adaptive-owner and unified-editability designs into independently testable implementation slices without weakening the existing read-first MCP sequence or duplicating canonical domain rules.

## Canonical specifications

```text
docs/superpowers/specs/2026-08-03-semogtw-adaptive-owner-experience-design.md
docs/superpowers/specs/2026-08-03-semogtw-unified-editability-agent-control-design.md
docs/superpowers/specs/2026-08-03-semogtw-spark-email-event-wake-addendum.md
```

Narrow domain rules remain owned by their existing specifications. In particular:

- Growth owns goals, checkpoints, evidence and the progress formula;
- remote MCP/Spark owns OAuth and Streamable HTTP;
- workflow orchestration owns reservations, exact-SHA obligations and recovery snapshots;
- the platform foundation owns visual tokens, package boundaries and private/public separation;
- `DEPLOYMENT.md` owns the observed host capability state and must continue to say production is unavailable until verified.

## Execution order

### Existing prerequisites

1. `2026-08-03-semogtw-remote-mcp-spark.md`
2. `2026-08-03-semogtw-workflow-mcp-read-catalog.md`
3. `2026-08-03-semogtw-learning-goals-core.md`
4. `2026-08-03-semogtw-learning-evidence-credentials.md`
5. `2026-08-03-semogtw-learning-mcp-spark-automation.md`

These plans remain authoritative for their current read-only/domain slices.

### New plans in this stack

1. [`2026-08-03-semogtw-growth-adaptive-owner-experience.md`](./2026-08-03-semogtw-growth-adaptive-owner-experience.md)
   - extends the Growth core without replacing its domain model;
   - adds quick creation, deterministic templates, automatic weights, progressive disclosure and explainable progress;
   - requires no AI provider.

2. [`2026-08-03-semogtw-command-gateway-editability-foundation.md`](./2026-08-03-semogtw-command-gateway-editability-foundation.md)
   - adds the framework-free command/application package;
   - durable idempotency receipts;
   - editability manifests and coverage guardrails;
   - migrates browser mutations through one canonical gateway.

3. [`2026-08-03-semogtw-agent-write-authorization.md`](./2026-08-03-semogtw-agent-write-authorization.md)
   - adds profiles, capabilities, resource grants, trust sessions, write scopes, confirmation challenges and kill switches;
   - remains unavailable to remote clients until the remote read gates pass.

4. [`2026-08-03-semogtw-approvals-change-sets.md`](./2026-08-03-semogtw-approvals-change-sets.md)
   - adds immutable approvals, recent-auth critical decisions, atomic database change sets and explicit external sagas.

5. [`2026-08-03-semogtw-operational-domain-write-rollout.md`](./2026-08-03-semogtw-operational-domain-write-rollout.md)
   - migrates Projects, Roadmap, Attention, repository-target and workflow-orchestration mutations to canonical commands;
   - adds specific resource-scoped MCP tools without GitHub writes or generic mutation.

6. [`2026-08-03-semogtw-growth-domain-write-rollout.md`](./2026-08-03-semogtw-growth-domain-write-rollout.md)
   - adds complete goal/checkpoint/skill/evidence/credential command and MCP parity;
   - preserves derived progress and proposal/review semantics.

7. [`2026-08-03-semogtw-editorial-appearance-write-rollout.md`](./2026-08-03-semogtw-editorial-appearance-write-rollout.md)
   - adds draft/revision/publication commands and typed appearance/navigation/dashboard configuration;
   - forbids executable HTML/JavaScript/CSS and generic settings mutation.

8. [`2026-08-03-semogtw-development-requests-control-plane.md`](./2026-08-03-semogtw-development-requests-control-plane.md)
   - adds development requests, branch/SHA/scope reservations, checkpoints and verification evidence;
   - does not yet grant an executor raw repository or deployment access.

9. [`2026-08-03-semogtw-development-executor.md`](./2026-08-03-semogtw-development-executor.md)
   - adds signed constrained jobs, separately authenticated worker, verified sandbox, scoped Git workspaces, checkpoint pushes, allowlisted exact-SHA gates and exact-head draft PR creation;
   - never merges or deploys.

10. [`2026-08-03-semogtw-deployment-rollback.md`](./2026-08-03-semogtw-deployment-rollback.md)
   - adds exact-head merge approval, immutable artifacts, typed deployment adapters, local-container preview, observed health and artifact rollback;
   - keeps production visibly disabled until a separate provider-specific adapter plan passes after host selection.

## Current implementation status

```text
1. Adaptive Growth Owner Experience
   branch: develop/learning-growth-core-implementation
   PR: #24 (draft)
   state: implemented; exact-head gates still tracked by that PR

2. Command Gateway and Editability Foundation
   branch: develop/command-gateway-foundation-implementation
   PR: #26 (draft)
   base SHA for the next plan: 5539ed2de905983e2c178ce7dbe8c2753ad760cb
   state: implemented with recorded frozen install, check, build and focused Playwright pass

3. Agent Write Authorization
   branch: develop/agent-write-authorization-implementation
   PR: #27 (draft)
   pure application authorization: implemented; branch gates not yet executed
   effective grants preserve atomic grant/capability/resource/risk clauses
   OAuth-backed persistence: blocked_internal because migration 0014 and @semogtw/mcp-auth are absent
   remote write enablement: blocked until authenticated remote read gates and concrete domain rollouts pass

4–10
   state: planned only
```

The authorization gate matrix and current handoff are canonical for this implementation state:

```text
docs/testing/2026-08-03-agent-write-authorization-test-matrix.md
docs/testing/2026-08-04-agent-write-authorization-progress.md
```

Do not create a placeholder OAuth table in plan 3. The provider-neutral capability, selector, grant-intersection, trust, challenge, switch and policy modules exist, but `0018_agent_authorization.sql` must retain its real foreign-key dependency on the OAuth client schema defined by plan 1 of the remote MCP stack.

## Hard gates

### MCP write gate

No remote write tool or write scope may be enabled until all of the following are observed on the exact implementation head:

- authenticated remote MCP read endpoint passes discovery, OAuth, PKCE, audience, expiry, rotation and revocation tests;
- request isolation, rate/concurrency limits, no-store behavior and sanitized logs pass;
- generic real-client reads pass;
- backup and rollback are rehearsed;
- Command Gateway, durable idempotency and editability coverage pass;
- agent authorization, confirmation challenges and kill switches pass;
- the concrete domain command has browser parity and its own risk review.

### Critical-action gate

No critical command executes until:

- immutable approval storage exists;
- payload hash and expected versions/SHA are bound;
- recent owner authentication is verified independently of page-session age;
- stale/expired/revoked approvals fail closed;
- the owner UI shows exact effects and non-reversibility.

### Domain rollout gate

No domain is declared UI/MCP-editable merely because authorization infrastructure exists. Its rollout plan must:

- inventory every current supported mutation;
- register specific commands/manifests/previews;
- migrate owner UI through the same gateway;
- add filtered resource-scoped MCP tools;
- prove derived/immutable/secret values cannot be overwritten;
- pass public confidentiality, idempotency, conflict, audit and approval tests.

### Development executor gate

No executor receives repository, agent-provider or secret-reference access until:

- Development Request lifecycle and cooperative scope reservation are implemented;
- signed job envelopes are verified;
- a host-enforced rootless sandbox profile passes filesystem/process/network/resource tests;
- repository, branch and path allowlists fail closed;
- exact-SHA verification evidence is mandatory;
- executor kill switches, lease loss, credential rotation and cleanup work;
- the target repository/policy/agent adapter is explicitly approved by the owner.

A plain Node child process is never treated as sufficient isolation. Ordinary UI/MCP clients never receive raw shell, filesystem or Git credentials.

### Deployment gate

No merge/deploy/rollback executes until:

- exact-head PR, required gates and current approval are revalidated;
- immutable artifact and known rollback target exist where required;
- deployment adapter ID/version/capabilities are statically registered and verified;
- environment/switch/config/secret references are owner-approved;
- health checks and external reconciliation are implemented;
- production additionally has a selected host, provider-specific adapter, capability evidence, recent owner authentication and critical approval.

The general deployment plan implements a real local preview adapter but does not authorize or pretend to provide production hosting.

### Spark email wake gate

The email wake bridge has no executable implementation plan yet. Create one only after:

- the owner's real Spark account demonstrates a Gmail monitor;
- the intended custom MCP app works in the same account;
- observed delay, duplicate and confirmation behavior are recorded;
- an outbound mail adapter is selected and reviewed;
- a low-risk concrete use case justifies the bridge;
- the remote read endpoint is already verified.

Until then, `2026-08-03-semogtw-spark-email-event-wake-addendum.md` is design/readiness guidance only.

## Migration reservation

Current planning reserves:

```text
0014_mcp_oauth.sql
0015_learning_goals.sql
0016_learning_evidence_credentials.sql
0017_command_core.sql
0018_agent_authorization.sql
0019_command_approvals.sql
0020_development_requests.sql
0021_development_executor.sql
0022_deployment_control.sql
```

The domain rollout plans reuse existing domain migrations unless their Task 1 inventory proves a strictly necessary additive change. They may not consume a migration number without reconciling this stack first.

This is a reservation, not permission to create migrations blindly. Before implementing any plan:

```bash
ls packages/database/migrations
rg "00(14|15|16|17|18|19|20|21|22)_" packages/database/migrations docs/superpowers
```

If another migration landed, renumber every unimplemented affected plan/spec together before code.

## Cross-plan invariants

- UI and MCP adapters call the same registered command handlers.
- Human UI is guided and task-oriented; command schemas are not rendered as raw forms.
- Core CRUD, templates and deterministic calculations remain usable without AI.
- AI output is an untrusted proposal with authenticated-client/provider provenance.
- Derived percentages and evidence-derived skill states are never arbitrary writable fields.
- Secrets are write-only/replace-only and never returned through MCP.
- Immutable history is corrected through append-only supersede/compensation.
- Every write has authorization, resource resolution, risk, idempotency, conflict and audit semantics.
- A risk ceiling and resource selector may authorize together only when they belong to the same effective grant clause.
- Critical operations require DevOS recent-auth approval.
- Public loaders/DTOs never expose private command, approval, agent, Growth, executor, deployment or event-wake state.
- Imported email/repository/provider content is data, not instruction.
- External acceptance/adapter/provider success is not claimed from a request being queued or accepted.
- Each task ends with focused tests, a reviewable commit and push.

## Required agent handoff

Every execution session records:

```text
Plan and task:
Branch and base SHA:
Latest commit pushed:
Files changed:
Tests actually executed:
Observed results/counts:
Unavailable or failing gates:
Security/privacy implications:
Documentation updated:
Known blockers:
Exact next action:
```
