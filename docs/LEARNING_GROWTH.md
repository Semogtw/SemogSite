# Semogtw DevOS — Learning, Growth, Evidence and Credentials

## Status

This document describes an **approved future product direction**. The Growth domain, migrations `0015`–`0016`, Growth routes and Growth MCP tools are not implemented by the planning branch.

Canonical specification:

- [`superpowers/specs/2026-08-03-semogtw-learning-growth-evidence-design.md`](./superpowers/specs/2026-08-03-semogtw-learning-growth-evidence-design.md)

Executable plans:

- [`superpowers/plans/2026-08-03-semogtw-learning-goals-core.md`](./superpowers/plans/2026-08-03-semogtw-learning-goals-core.md)
- [`superpowers/plans/2026-08-03-semogtw-learning-evidence-credentials.md`](./superpowers/plans/2026-08-03-semogtw-learning-evidence-credentials.md)
- [`superpowers/plans/2026-08-03-semogtw-learning-mcp-spark-automation.md`](./superpowers/plans/2026-08-03-semogtw-learning-mcp-spark-automation.md)

## Product decision

Semogtw DevOS is canonical. Spark, GitHub, Gmail and other providers are adapters.

```text
Goal and checkpoints in DevOS
          │
          ├── manual activity
          ├── GitHub observations
          ├── certificates/credentials
          └── external-agent proposals
                    │
                    ▼
          evidence candidate/review
                    │
                    ▼
       accepted checkpoint/skill claim
                    │
                    ▼
          reproducibly derived progress
```

No external model may set an unexplained percentage or claim completion from a commit, file extension, email subject or confidence score.

## Planned private surfaces

```text
/devos/growth
/devos/growth/goals
/devos/growth/goals/$goalId
/devos/growth/evidence
/devos/growth/skills
/devos/growth/credentials
/devos/growth/integrations
```

## Core semantics

### Goals and checkpoints

- learning goals only in the initial aggregate;
- ordered checkpoints with positive weights;
- binary or numeric completion modes;
- explicit lifecycle and optimistic versions;
- goal completion requires all required checkpoints completed or owner-waived;
- progress is derived from checkpoint state and accepted values;
- no canonical `goal_progress_percent` column or mutation.

### Skills

Skills are owner-controlled private taxonomy. Evidence-backed stages are:

```text
introduced → practicing → applied → demonstrated
```

These labels describe evidence inside DevOS, not universal mastery or employability.

### Evidence

External findings enter as candidates with explicit claims. Default policy is owner review.

Allowed deterministic auto-accept is narrow and reproducible, such as an exact trusted workflow result for an exact branch/SHA or an exact credential issuer/ID/verification rule. LLM classification, keywords and file types cannot auto-accept.

### Credentials

Credentials distinguish:

```text
pending_review
verified
unverified
expired
revoked
rejected
```

A Gmail/Spark extraction creates `pending_review`. The site receives normalized fields, not Gmail credentials or an entire mailbox. Optional files live in private host storage with type/size/hash controls, not SQLite blobs.

## Planned data sequence

```text
0014_mcp_oauth.sql                    remote MCP plan
0015_learning_goals.sql               goals/checkpoints/skills/events
0016_learning_evidence_credentials.sql candidates/claims/reviews/policies/credentials
```

Migration numbers must be reconciled on the newest branch before implementation if another migration lands first.

## Planned MCP reads

```text
devos_list_learning_goals
devos_get_learning_goal
devos_list_due_learning_checkpoints
devos_get_skill_profile
devos_list_learning_evidence
devos_list_credentials
```

They remain bounded, read-only and available under `devos.read` after the remote endpoint and Growth domains are verified.

## Future supervised writes

Reserved desired operations:

```text
devos_create_learning_goal
devos_add_learning_checkpoint
devos_link_goal_repository
devos_propose_learning_evidence
devos_propose_goal_progress
devos_propose_credential
```

These names do not authorize implementation. A separate post-gate OAuth/MCP write specification is mandatory.

Safety direction:

- goal/checkpoint creation may become a supervised canonical write;
- external evidence/progress/certificates create proposals by default;
- no MCP tool directly sets percentage, completes goals, accepts evidence, verifies credentials or waives checkpoints;
- browser owner confirmation remains the fallback.

## Spark workflows

### Learning-plan creation

Spark may transform “quero aprender Python” into a bounded goal/checkpoint preview. Before supervised writes exist, the preview is copied/imported manually. After a future write gate, creation may use dedicated audited tools.

### Weekly GitHub evidence review

Spark reads goals/checkpoints, inspects GitHub read-only and produces exact repository/branch/SHA/PR/workflow candidates. It never treats commit silence as failure or code presence as comprehension.

### Gmail credential monitor

Spark extracts title, issuer, dates, hours, credential ID and verification URL from likely certificate emails. Before write authorization, it produces a structured preview. Later it may submit a pending proposal.

### Growth briefing

Spark may combine DevOS reads with Calendar/Gmail/Tasks on the Google side. SemogSite receives no Workspace credentials.

## Security boundaries

- all Growth state is owner-private and `noindex`;
- external text is data, never instruction;
- raw provider/email bodies, tokens and authorization headers are not persisted;
- GitHub references use exact normalized identities;
- candidate/review/credential actions are idempotent, versioned and audited;
- attachment storage requires a reviewed private host adapter;
- logs exclude Growth payloads, credential IDs, email references and MCP arguments/results;
- provider unavailability is an external dependency and never changes canonical state.

## Delivery order

1. authenticated remote MCP foundation;
2. workflow/recovery MCP reads;
3. learning goals/checkpoints/skills core;
4. evidence and credentials;
5. Growth MCP reads and Spark read-only acceptance;
6. separate supervised-write design after all prerequisite evidence exists.
