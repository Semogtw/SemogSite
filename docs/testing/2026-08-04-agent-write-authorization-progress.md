# Agent Write Authorization — Implementation Handoff

## Handoff

```text
Plan and task:
  docs/superpowers/plans/2026-08-03-semogtw-agent-write-authorization.md
  Pure application authorization foundation implemented.
  OAuth-backed persistence and remote adapters remain blocked by prerequisites.

Branch and base SHA:
  branch: develop/agent-write-authorization-implementation
  PR: #27
  base branch: develop/command-gateway-foundation-implementation
  base SHA: 5539ed2de905983e2c178ce7dbe8c2753ad760cb

Latest code/documentation head before this handoff commit:
  2faf5c3e44f55a5e7324e04801adf50985d64416

Tests actually executed for this branch:
  none

Observed results/counts:
  PR #27 is open, draft and mergeable.
  33 files changed were reported before this handoff commit.
  No commit status or workflow run was observed for the previously queried authorization head.
  No focused test, typecheck, build or Playwright output was observed for this branch.

Unavailable or failing gates:
  no repository checkout in the connected runtime
  pnpm unavailable in the connected runtime
  DNS access to github.com unavailable from the runtime
  OAuth migration 0014 absent
  @semogtw/mcp-auth package absent
  authenticated remote MCP read endpoint absent

Security/privacy implications:
  remote writes remain unavailable
  no OAuth-backed grant or trust storage was created
  no fake OAuth client table or migration 0018 was created
  no default grant was seeded
  no generic mutation/SQL/shell/filesystem/Git/HTTP tool was added
  client confirmed/approvalId fields do not authorize agent commands
  critical actions never use trust or client confirmation
  policy and trust bind selector plus risk to the same grant clause

Documentation updated:
  docs/testing/2026-08-03-agent-write-authorization-test-matrix.md
  docs/architecture/EDITABILITY_COVERAGE.md
  docs/superpowers/plans/2026-08-03-semogtw-agent-editability-plan-stack.md
  this handoff

Known blockers:
  implement and verify remote MCP/OAuth prerequisite plan
  define the real mcp_oauth_clients ownership/lifecycle schema
  run exact-head application tests and typecheck
  run repository-wide boundaries/check/build
  implement persistence only after prerequisite reconciliation

Exact next action:
  obtain a Node 22/pnpm checkout of this exact branch and run the focused
  application test/typecheck gates. Repair any strict-type or runtime failures,
  then rerun repository check/build. Do not begin migration 0018 until migration
  0014 and @semogtw/mcp-auth exist on the exact base.
```

## Implemented framework-free modules

```text
packages/application/src/authorization/capabilities.ts
packages/application/src/authorization/catalog-coverage.ts
packages/application/src/authorization/resource-selectors.ts
packages/application/src/authorization/effective-grant.ts
packages/application/src/authorization/trust-session.ts
packages/application/src/authorization/write-switches.ts
packages/application/src/authorization/confirmation-challenge.ts
packages/application/src/authorization/policy-engine.ts
packages/application/src/authorization/agent-command-policy.ts
packages/application/src/authorization/types.ts
```

The application package retains its framework/persistence/MCP/Node-runtime boundary.

## Closed capability and resource model

Capabilities map explicitly to:

```text
OAuth write scope
reviewed resource kind
closed domain switch key
```

Unknown and administrative-looking capabilities fail closed. Resource selectors require canonical plain data and exact reviewed shapes. Parent references do not broaden exact-ID authorization.

## Effective grant clauses

The effective authorization output retains aggregate summaries for owner display and diagnostics, but authorization uses only atomic clauses:

```text
grantId + capability + resourceSelectors + riskCeiling
```

This closes a same-capability cross-grant escalation discovered during review. For example, a high-risk grant scoped to resource A cannot combine its ceiling with a low-risk grant scoped to resource B. Policy and trust require a matching clause to cover both the exact resource selector and the requested risk.

## Trust sessions

Trust sessions are bounded to 5–480 minutes, 1–100 operations and low/medium risk. Validation requires capability/resource/risk subsets of clauses selected by persisted `baseGrantIds`. Invalid chronology, malformed grant bindings, expiry, revocation and exhaustion fail closed.

A concrete trust helper verifies the exact command capability, canonical resource and low/medium risk. High and critical commands are never trusted.

## Confirmation challenges

The pure challenge service uses injected randomness, digest and persistence ports. The raw response token is returned once; persisted material contains only the digest and exact client/command/payload/resource bindings. Human summaries are not persisted by the challenge record.

No concrete repository exists on this branch.

## Agent command policy

The Command Gateway now passes the canonical server-bound target to policies. The provider-neutral agent policy requires the exact MCP client/owner binding, an enabled command, a canonical resource resolution and independent global/client/domain write switches.

Decision order:

```text
effective authorization
write switches
capability
canonical resource
matching grant clause risk ceiling
static command confirmation floor
trust/challenge for confirmable actions
owner/DevOS approval preparation
```

Static `deny`, `prepare_approval` and `approve_in_devos` dispositions are monotonic. A high grant may allow a critical request to reach DevOS approval preparation; it never executes the critical command.

## Registered tests

The branch contains focused tests for capability mappings, catalog coverage, strict resource selectors, effective grant intersection, atomic clause binding, trust bounds/integrity/concrete coverage, write switches, challenges, policy order/integrity/static floors, Gateway canonical-target delivery and provider-neutral policy composition.

These tests are committed but not recorded as executed.

## Mandatory exact-head gates

```text
pnpm install --frozen-lockfile
pnpm --filter @semogtw/application test
pnpm --filter @semogtw/application typecheck
pnpm check:editability-coverage
pnpm check:boundaries
pnpm check
pnpm build
```

Later OAuth persistence and remote adapter gates remain inapplicable until their prerequisite packages and migrations exist.
