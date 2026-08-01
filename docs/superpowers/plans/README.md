# SemogSite Implementation Plans

This directory contains the executable plans for agentic development of the Semogtw public site and Semogtw DevOS.

Agents must read this index, the applicable plan, the current repository handoff, and the latest commits before changing code. Plans describe intended work; repository code and observed test output remain the source of truth for implementation state.

## Current execution order

### 1. Platform foundation

[`2026-08-01-semogtw-platform-foundation.md`](./2026-08-01-semogtw-platform-foundation.md)

Builds the host-portable workspace, domain/contracts, database, authentication, public site, protected DevOS, read-only operational views, API partition, security preflight, tests, and foundation documentation.

Related evidence:

- [`../../SITES_CAPABILITY_ASSESSMENT.md`](../../SITES_CAPABILITY_ASSESSMENT.md)
- [`../specs/2026-08-01-semogtw-platform-foundation-design.md`](../specs/2026-08-01-semogtw-platform-foundation-design.md), when present
- [`../../UPSTREAM_REFERENCE.md`](../../UPSTREAM_REFERENCE.md)

### 2. Operational writes, evidence, audit, and backup

[`2026-08-01-semogtw-operational-writes.md`](./2026-08-01-semogtw-operational-writes.md)

Establishes confirmed attention capture, audited attention lifecycle transitions, development-session handoffs, manual evidence and stage-completion writes, private backup verification, and an owner-only audit review surface. Safe operational writes must be complete before agent write tools are exposed.

### 3. GitHub read-only synchronization and branch recommendations

Create a dedicated plan after operational repositories and evidence models exist. GitHub state must remain evidence-backed, timestamped, and confidence-labelled.

### 4. MCP resources, read tools, and safe writes

Create or execute the MCP plan only after authentication, private APIs, audit, idempotency, and deployment compatibility are verified. Read tools precede write tools.

### 5. ChatGPT execution control plane

[`2026-08-01-semogtw-chatgpt-execution-control-plane.md`](./2026-08-01-semogtw-chatgpt-execution-control-plane.md)

Adds cooperative run registration, checkpoints, event history, stale detection, completion/blockage reporting, queued owner commands, evidence, notifications, and the private `/devos/runs` experience.

This phase has no paid OpenAI API dependency. It uses the approved remote MCP surface and does **not** claim direct access to the user's normal ChatGPT conversations, hidden model state, or instant message injection.

Agents implementing earlier phases must preserve the extension points listed in **Checkpoint 0** of this plan and must not create conflicting run/status/command models.

### 6. Editorial workflow and publication approval

Create a dedicated plan for private draft generation, sensitive-data review, preview, approval, publication, rollback, and public metadata.

### 7. Scheduled reconciliation, webhooks, and insights

Create a dedicated plan only after the selected host proves the required scheduler/webhook behavior or an external adapter is selected.

### 8. Host verification and controlled publication

Use the Sites capability assessment and direct deployment evidence. Save and inspect a version before every production deployment. Keep the MCP gateway and scheduled work separately deployable when Sites does not pass those gates.

## Cross-plan rules

- Product identity is **Semogtw** and the private application is **Semogtw DevOS**.
- Prefer continuing the branch with real, most recent development instead of creating unnecessary branches.
- Commit after every independently testable unit and push frequently to reduce reset risk.
- Attempt to install and run required tooling locally before using GitHub Actions.
- GitHub Actions are a last resort and should be used sparingly.
- Never mark a test or gate as passed without observed output.
- Document unavailable tests and continue with other resolvable work.
- Preserve public/private DTO isolation and fail closed for private routes.
- Do not expose secrets, private repository metadata, branches, blockers, evidence, agent runs, or command queues publicly.
- Telemetry failure must not stop productive repository work; preserve progress through commits, pushes, and handoff records.
- Update architecture, data model, security, testing, deployment, MCP, runbook, and changelog documentation as implementation advances.

## Agent handoff requirement

Every development session must record:

```text
Plan and checkpoint:
Branch:
Latest commit pushed:
Work completed:
Tests actually executed:
Tests unavailable or failing:
Security/privacy implications:
Documentation updated:
Known blockers:
Exact next action:
```
