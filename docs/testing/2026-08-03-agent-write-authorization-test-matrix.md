# Agent Write Authorization — Gate and Test Matrix

## Execution identity

```text
plan: docs/superpowers/plans/2026-08-03-semogtw-agent-write-authorization.md
branch: develop/agent-write-authorization-implementation
PR: #27
base branch: develop/command-gateway-foundation-implementation
base SHA: 5539ed2de905983e2c178ce7dbe8c2753ad760cb
latest code head before this documentation commit: 97835fc73fb52d5519df2ebbdefac174b433bebc
```

## Gate decision

```text
pure application policy work: implemented; execution gates pending
OAuth-backed persistence work: blocked_internal
remote write enablement: blocked_internal
real remote-client acceptance: blocked_external
```

The verified Command Gateway foundation is sufficient for provider-neutral authorization logic. It is not sufficient to create OAuth-bound grants, persist trust/challenges or expose remote write tools.

`packages/database/migrations/0014_mcp_oauth.sql` and `packages/mcp-auth/package.json` are absent on the exact base. Therefore migration `0018_agent_authorization.sql`, repositories that require `mcp_oauth_clients`, MCP discovery filtering and remote write UI enablement must not pretend their prerequisite exists.

Migration `0018_agent_authorization.sql` is also absent, so its reservation remains available. It must not be created until the exact table, owner and client lifecycle contract from migration `0014` is implemented and verified.

## Observed prerequisite evidence

| Prerequisite | Exact-head evidence | Decision |
| --- | --- | --- |
| Command Gateway package and registry | Implemented on base SHA and covered by PR #26 evidence | ready |
| Durable semantic receipts | Canonical result/hash and corrupt-replay fail-closed behavior recorded on PR #26 | ready |
| Editability catalog and POST inventory guardrail | Implemented and included in the recorded base `pnpm check` | ready |
| Focused owner UI parity for `attention.transition` | Recorded Playwright pass on the PR #26 exact head | ready |
| Canonical target available to policy | `CommandPolicy.evaluate` now receives the server-bound `CommandTarget` | implemented_unverified |
| OAuth client table `mcp_oauth_clients` | Migration `0014_mcp_oauth.sql` not found | blocked_internal |
| Package `@semogtw/mcp-auth` | Package manifest not found | blocked_internal |
| Authenticated remote MCP read endpoint | No implementation/evidence on this stack | blocked_internal |
| Generic real-client read acceptance | Not available before the remote endpoint exists | blocked_external |
| Spark account acceptance | Real-account capability has not been demonstrated | blocked_external |
| Persisted remote-write switches | No OAuth-backed authorization storage exists | blocked_internal |

## Registered command authorization inventory

| Command | Capability | Resource kind | Risk floor | Static confirmation | Owner UI parity | MCP discovery | Write rollout gate |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `attention.transition@1` | `attention.write` | `attention_item` | `medium` | `confirm_in_client` | Gateway-backed | `not_yet` | Persisted agent authorization plus operational-domain rollout; remote read gates must pass before exposure |
| `roadmap.stages.complete@1` | `roadmap.write` | `stage` | `high` | `approve_in_devos` | Registered but legacy/approval-blocked | `not_yet` | Immutable approvals, recent authentication and operational-domain rollout |

No legacy operation is remotely writable merely because it appears in the mutation inventory. A command enters agent discovery only after capability, resource selector behavior, risk ceiling, static confirmation/approval path, concrete domain rollout and remote-read acceptance are all verified.

## Implemented pure application foundation

### Closed capability vocabulary

The framework-free package now provides exact mappings for:

```text
AgentCapability -> OAuth write scope
AgentCapability -> reviewed resource kind
AgentCapability -> closed domain switch key
```

Unknown, wildcard, administrative-looking or execution capabilities fail closed. `development.request` does not imply repository execution, integration administration or deployment authority.

### Strict resource selectors

Implemented selector kinds:

```text
all
exact_ids
canonical_prefixes
lifecycle_states
```

The validator requires plain data objects, exact keys, bounded arrays and reviewed resource kinds. `all` requires explicit owner selection. Prefixes reject wildcard, URL-like, absolute, traversal and non-canonical path forms. Matching never promotes parent references into implicit authorization.

### Atomic grant clauses

Effective authorization is the intersection of authenticated owner/client identity, recognized OAuth write scopes and active grants. Every contributing `grant + capability` produces an immutable effective clause:

```text
grantId
capability
resourceSelectors
riskCeiling
```

Aggregated capability/resource/risk views remain available only for display and diagnostics. Policy and trust authorization use `authorizationClauses` so a high-risk ceiling from one grant cannot combine with a selector from another grant, even when both grants carry the same capability.

Duplicate IDs with different material fail closed. Equivalent duplicate scopes, grants, capabilities and selectors are normalized deterministically.

### Trust sessions

Pure trust validation enforces:

- duration between 5 and 480 minutes;
- operation limit between 1 and 100;
- risk ceiling only `low` or `medium`;
- no session-to-session delegation;
- exact owner/client binding;
- capability subset;
- resource selectors covered by clauses from the persisted `baseGrantIds`;
- requested risk and selector covered by the same underlying grant clause;
- no high or critical trust;
- invalid, not-started, expired, exhausted or revoked sessions fail closed;
- concrete command coverage checks capability, resource, risk and current session state.

### Confirmation challenges

The provider-neutral service uses injected store, randomness and SHA-256 ports. It defines:

- ten-minute TTL;
- at least 32 random response bytes;
- exact binding to client, command ID/version, payload hash and resource snapshot hash;
- one-use atomic consumption contract;
- medium/high creation only;
- critical actions never client-confirmed;
- raw response token returned only in the initial response;
- persisted record contains the digest, not the raw token or human summary.

No concrete store is implemented on this branch.

### Independent write switches

The pure switch evaluator requires all three independent values:

```text
globalEnabled
clientEnabled
domainEnabled
```

Any missing, malformed or false value disables writes. Read authorization is deliberately outside this calculation.

### Policy engine and Gateway adapter

Decision order is fixed:

```text
1. effective authorization
2. global/client/domain switches
3. capability
4. canonical resource
5. matching grant clause risk ceiling
6. static command confirmation floor
7. trust or one-use challenge for confirmable actions
8. owner/DevOS approval preparation for high/critical actions
```

The static command manifest is monotonic: `deny`, `prepare_approval` and `approve_in_devos` cannot be lowered by trust, challenge or client fields. A high clause may permit a critical request to reach `approve_in_devos`; it never directly executes the critical command.

`createAgentCommandPolicy` requires an MCP actor bound to the exact effective owner/client, rejects `registered_blocked` commands before resource/storage reads, resolves the canonical resource through an injected port and ignores browser/MCP-supplied `confirmed` and `approvalId` values.

## Registered focused tests — not executed in this session

```text
authorization/capabilities.test.ts
authorization/capability-domains.test.ts
authorization/catalog-coverage.test.ts
authorization/resource-selectors.test.ts
authorization/resource-selectors-integrity.test.ts
authorization/effective-grant.test.ts
authorization/grant-clause-binding.test.ts
authorization/trust-session.test.ts
authorization/trust-session-integrity.test.ts
authorization/trust-session-command-coverage.test.ts
authorization/write-switches.test.ts
authorization/confirmation-challenge.test.ts
authorization/policy-engine.test.ts
authorization/policy-engine-integrity.test.ts
authorization/policy-static-confirmation.test.ts
authorization/agent-command-policy.test.ts
command-gateway-policy-target.test.ts
public-surface.test.ts
```

The tests cover closed mappings, strict runtime structures, deterministic ordering, cross-capability isolation, same-capability cross-grant clause binding, trust bounds, challenge digest-only storage, kill-switch precedence, static confirmation floors and canonical-target policy composition.

## Persistence layer — blocked until migration 0014

The following are intentionally not implemented:

```text
same-owner OAuth client foreign key
built-in profile seed and immutable templates
global remote-write switch disabled by default in storage
transactional nested grants/selectors/events
trust-session operation consumption and revoke cascade
digest-only confirmation challenge repository
backup and restore without raw secret material
```

No fake OAuth table, weakened nullable client binding or temporary migration was introduced.

## Remote adapter and owner UI — blocked until read endpoint acceptance

The following remain unavailable:

```text
OAuth scope plus effective-grant filtered MCP discovery
remote write scopes
remote command execution
owner profile/grant/trust persistence UI
self-management denial integration
real-client revocation and isolation acceptance
```

The provider-neutral policy classes do not expose a tool or endpoint by themselves.

## Commands and observed execution status

The base PR records successful exact-head runs for its installation, checks, build and focused Playwright scenario. This connected session has no repository checkout, pnpm runtime or DNS access to GitHub, so no new authorization test, typecheck or build output was observed.

Mandatory commands when a Node 22/pnpm checkout is available:

```text
pnpm install --frozen-lockfile
pnpm --filter @semogtw/application test
pnpm --filter @semogtw/application typecheck
pnpm check:editability-coverage
pnpm check:boundaries
pnpm check
pnpm build
```

After the missing remote MCP/OAuth prerequisite lands, the later persistence/adapter phase must additionally run:

```text
pnpm --filter @semogtw/database test
pnpm --filter @semogtw/database typecheck
pnpm --filter @semogtw/mcp-auth test
pnpm --filter @semogtw/mcp test
```

Commands targeting `@semogtw/mcp-auth` remain impossible until that prerequisite package exists.

## Current implementation boundary

This branch may continue with framework-free validation, documentation and exact-head repair. It must not:

- create migration `0018_agent_authorization.sql` before migration `0014` exists;
- create a substitute OAuth client table;
- seed default write grants;
- expose write scopes or remote mutation tools;
- treat authorization infrastructure as a completed domain rollout;
- accept client-selected principal, capability, risk or approval state;
- add generic command, SQL, shell, filesystem, Git or HTTP execution.
