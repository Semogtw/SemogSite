# Semogtw Cooperative Agent Run Protocol

## Purpose

This protocol lets a participating development agent report work to Semogtw DevOS without claiming access to ChatGPT account state, hidden reasoning, token streaming or the execution controls of another conversation.

A run is **cooperative reported state**. It exists only when an authorized participant explicitly records it.

## Required participation loop

Before substantial work:

1. create or resume one run for the concrete development goal;
2. identify the project, branch and current phase when known;
3. record a concise initial summary and the next safe action;
4. choose a stale threshold appropriate to the expected reporting cadence.

During work:

1. publish a heartbeat only to report continued participation; a heartbeat must not invent progress;
2. publish a checkpoint after a meaningful gate, commit group, test result, blocker or architectural decision;
3. include concrete commit SHAs and the observed test status when available;
4. keep progress monotonic and evidence-based;
5. poll pending owner commands before beginning a new major step and before finalizing;
6. acknowledge a command when it has been understood;
7. mark a command completed only after it was actually incorporated;
8. reject unsafe, impossible, stale or conflicting commands with a concise reason.

When blocked:

1. identify the blocker precisely;
2. state the exact unlock action;
3. preserve the next executable step;
4. avoid asking broad questions when productive work remains elsewhere.

Before ending:

1. record a final checkpoint;
2. choose `completed`, `failed` or `cancelled` honestly;
3. preserve remaining work in the final summary when the result is partial;
4. attach or reference concrete commits, tests and documents;
5. never leave a terminal run with an implied next action.

## Reporting language

Use:

- **reported checkpoint**;
- **last agent update**;
- **current at the last report**;
- **possibly inactive**;
- **stale according to the configured threshold**.

Do not use:

- **currently thinking**;
- **live model telemetry**;
- **still running**, unless the current agent is reporting its own activity at that moment;
- **stopped**, based only on silence;
- **message sent to ChatGPT**, for a queued owner command.

## Checkpoint content

A useful checkpoint contains:

```text
Phase:
Progress supported by the current plan:
Summary of completed work:
Commit SHAs:
Tests status: not_run | partial | passed | failed | blocked
Tests actually observed:
Blockers:
Next step:
```

Do not include source-code dumps, raw logs, hidden reasoning, passwords, cookies, access tokens, API keys, private keys or authorization headers.

## Owner command semantics

Commands are a cooperative pull queue.

- `continue`: continue safe work, optionally considering a note;
- `pause`: stop at the next safe checkpoint and preserve state;
- `cancel`: end cooperatively with a reason and final checkpoint;
- `reprioritize`: change the next major unit of work;
- `request_checkpoint`: report selected evidence sections;
- `provide_context`: add bounded, authorized context.

Creating a command does not inject a message into ChatGPT. The agent sees it only after polling the Semogtw queue.

`acknowledged` means the command was read and understood. It does not mean it was applied. `completed` means the requested action was actually incorporated. `rejected` requires a reason.

## MCP unavailable fallback

When the MCP transport, authentication or host is unavailable:

1. continue all safe repository work that does not depend on the unavailable capability;
2. preserve progress through frequent commits and pushes;
3. update the repository handoff/plan with the run ID when known, phase, checkpoint, tests, blockers and exact next step;
4. retain the intended idempotency key or another reconciliation reference when practical;
5. reconcile missed run events after the approved transport becomes available;
6. never treat telemetry failure as permission to stop productive work;
7. never expose a temporary unauthenticated endpoint merely to restore telemetry.

## Current implementation boundary

The repository currently contains:

- run registration, heartbeat/lifecycle transitions and checkpoints;
- SQLite persistence with optimistic concurrency and immutable events;
- owner-only run list/detail pages;
- owner-side command queue creation;
- command acknowledge/complete/reject services and persistence contracts;
- derived freshness on reads.

The repository does **not** currently expose these writes through remote MCP. Remote transport remains blocked until authentication, authorization, session isolation, origin/host policy, rate limits, revocation and rollback are verified.
