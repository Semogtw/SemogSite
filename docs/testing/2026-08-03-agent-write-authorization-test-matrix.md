# Agent Write Authorization — Gate and Test Matrix

## Execution identity

```text
plan: docs/superpowers/plans/2026-08-03-semogtw-agent-write-authorization.md
branch: develop/agent-write-authorization-implementation
base branch: develop/command-gateway-foundation-implementation
base SHA: 5539ed2de905983e2c178ce7dbe8c2753ad760cb
```

## Gate decision

```text
pure application policy work: ready
OAuth-backed persistence work: blocked_internal
remote write enablement: blocked_internal
real remote-client acceptance: blocked_external
```

The verified Command Gateway foundation is sufficient to implement and test provider-neutral authorization logic. It is not sufficient to create OAuth-bound grants or expose remote write tools.

`packages/database/migrations/0014_mcp_oauth.sql` and `packages/mcp-auth/package.json` are absent on the exact base. Therefore migration `0018_agent_authorization.sql`, repositories that require `mcp_oauth_clients`, MCP discovery filtering and remote write UI enablement must not pretend their prerequisite exists.

Migration `0018_agent_authorization.sql` is also absent, so its reservation remains available. It must not be created until the exact table and ownership contract from migration `0014` is implemented and verified.

## Observed prerequisite evidence

| Prerequisite | Exact-head evidence | Decision |
| --- | --- | --- |
| Command Gateway package and registry | Implemented on base SHA and covered by PR #26 evidence | ready |
| Durable semantic receipts | Implemented with canonical result/hash and corrupt-replay fail-closed behavior | ready |
| Editability catalog and POST inventory guardrail | Implemented and included in the recorded `pnpm check` run | ready |
| Focused owner UI parity for `attention.transition` | Recorded Playwright pass on the PR #26 exact head | ready |
| OAuth client table `mcp_oauth_clients` | Migration `0014_mcp_oauth.sql` not found | blocked_internal |
| Package `@semogtw/mcp-auth` | Package manifest not found | blocked_internal |
| Authenticated remote MCP read endpoint | No implementation/evidence on this stack | blocked_internal |
| Generic real-client read acceptance | Not available before the remote endpoint exists | blocked_external |
| Spark account acceptance | Real-account capability has not been demonstrated | blocked_external |
| Remote-write global switch | Must remain conceptually disabled until persistence exists | blocked_internal |

## Registered command authorization inventory

| Command | Capability | Resource kind | Risk floor | Owner UI parity | MCP discovery | Write rollout gate |
| --- | --- | --- | --- | --- | --- | --- |
| `attention.transition@1` | `attention.write` | `attention_item` | `medium` | Gateway-backed | `not_yet` | Agent authorization plus operational-domain rollout; remote read gates must pass before exposure |
| `roadmap.stages.complete@1` | `roadmap.write` | `stage` | `high` | Registered but legacy/approval-blocked | `not_yet` | Immutable approvals, recent authentication and operational-domain rollout |

No legacy operation is treated as remotely writable merely because it appears in the mutation inventory. A command enters agent discovery only after its capability, resource selector behavior, risk ceiling, confirmation/approval path and concrete domain rollout are all classified.

## Planned focused tests

### Pure application layer

```text
capability mapping is closed and exact
unknown capability denies
resource selectors are canonical and bounded
resource-kind absence never means all
OAuth scope and grants intersect; neither is sufficient alone
trust sessions cannot add capability or raise risk
critical risk cannot be trusted or client-confirmed
ordering and deduplication are deterministic
```

### Persistence layer — blocked until migration 0014

```text
same-owner OAuth client foreign key
built-in profile seed and immutable templates
global remote-write switch disabled by default
transactional nested grants/selectors/events
trust-session operation consumption and revoke cascade
digest-only confirmation challenges
backup and restore without raw secret material
```

### Remote adapter and UI — blocked until read endpoint acceptance

```text
OAuth scope plus effective grant filtered discovery
global/client/domain kill switches
one-use confirmation challenges
self-management denial
owner-only profile/grant/trust management
public confidentiality
real-client revocation and isolation
```

## Commands and observed execution status

The base PR records successful exact-head runs for its own required installation, checks, build and focused Playwright scenario. This connected session has no repository checkout or DNS access to GitHub, so the new authorization tests cannot be executed here.

The following remain mandatory when a Node 22/pnpm checkout is available:

```text
pnpm check:editability-coverage
pnpm --filter @semogtw/application test
pnpm --filter @semogtw/application typecheck
pnpm --filter @semogtw/database test
pnpm --filter @semogtw/database typecheck
pnpm --filter @semogtw/mcp-auth test
pnpm --filter @semogtw/mcp test
pnpm check
pnpm build
```

Commands targeting `@semogtw/mcp-auth` remain expected failures until that prerequisite package is implemented by the remote MCP plan.

## Implementation boundary for this branch

Proceed now with provider-neutral, framework-free work that has no persistence or remote transport dependency:

1. canonical agent capabilities;
2. reviewed resource selector validation/matching;
3. effective grant intersection;
4. pure trust-session request validation and active-state evaluation;
5. pure confirmation-challenge material validation if it does not imply storage or remote exposure.

Do not create a fake OAuth table, weaken the planned foreign key, seed default grants, expose write scopes, or add a generic command execution tool to bypass the missing prerequisite.
