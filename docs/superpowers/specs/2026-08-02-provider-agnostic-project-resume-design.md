# Provider-Agnostic Project Session Detection and Resume Launcher

**Status:** Approved product addition  
**Date:** 2026-08-02  
**Repository:** `Semogtw/SemogSite`  
**Related plan:** `docs/superpowers/plans/2026-08-01-semogtw-chatgpt-execution-control-plane.md`

## 1. Decision

Semogtw DevOS must support detecting when development on a repository branch has probably stopped and helping the owner resume that work in an external AI interface.

This capability is **provider-agnostic**. It must not require ChatGPT Sites, ChatGPT Plus, a paid OpenAI API, or any single AI vendor. ChatGPT Sites may be implemented later as one optional deployment adapter, but it is not the product baseline and its absence must not reduce core functionality.

The portable baseline is:

1. observe persisted agent activity and GitHub branch activity;
2. classify inactivity conservatively;
3. generate a continuation prompt from persisted project state;
4. copy the prompt to the clipboard;
5. open an owner-configured destination URL for ChatGPT, Gemini, Claude, another web interface, or a custom/local agent;
6. preserve an audit record of the generated handoff.

Automatic prompt insertion or submission is optional and may only be enabled through an officially supported, verified provider adapter. The baseline must never scrape a provider UI, store browser session cookies, or depend on fragile DOM automation.

## 2. Existing support and gap

The current execution-control plan already provides most of the foundation:

- configurable stale classification from `last_activity_at`;
- `agent_runs` associated with project, repository, branch, commits, status, and optional external conversation URL;
- explicit `completed`, `completed_partial`, `failed`, `stale`, and `cancelled` states;
- resume and supersede semantics that preserve history;
- project and run views with data age and conversation links;
- cooperative MCP checkpoints without a paid OpenAI API;
- language such as **possibly inactive** instead of claiming live model telemetry.

The missing capability is a fallback that works when the external agent does not participate through MCP. This design adds GitHub-derived activity classification and a provider-independent prompt launcher.

This document extends the existing execution-control plan. Where the older plan refers specifically to ChatGPT, implementations should use the generic terms **external agent**, **AI destination**, and **external conversation URL**, except where a ChatGPT-specific adapter is being described.

## 3. Product goals

The project tracking surface must let the owner answer four questions quickly:

1. Which branch was most recently active?
2. Is an agent still reporting activity, merely quiet, or probably no longer running?
3. What exact repository state should a new session continue from?
4. Which button opens the configured AI destination with a trustworthy continuation prompt ready to paste?

The feature must reduce manual reconstruction of context without pretending that commit silence proves an AI session has ended.

## 4. Non-goals

This feature does not:

- discover or read arbitrary conversations from an AI provider account;
- determine whether a model is currently thinking;
- inspect hidden reasoning or token streams;
- press Continue, Stop, or Send inside an external website;
- store provider authentication cookies;
- mark a stage or run completed merely because no commit was observed;
- assume that one branch is active without persisted evidence or an explicit owner decision;
- require a browser extension for baseline operation.

## 5. Activity sources and precedence

Activity signals are evaluated in this order:

1. explicit final run state reported by a participating agent;
2. explicit heartbeat or checkpoint from a participating agent;
3. observed GitHub commit on the accepted active branch;
4. observed workflow/test activity associated with that branch;
5. owner-entered session handoff;
6. repository synchronization timestamp, which is only data freshness and not work activity.

A stronger signal may override a weaker signal. For example, a fresh agent heartbeat means the run remains **reported active** even when the last commit is older than the branch threshold.

GitHub commit inactivity alone may classify a session as **probably ended**, but never as **completed**.

## 6. Canonical activity classification

Add a derived project/repository activity classification:

```ts
export type DevelopmentActivityStatus =
  | "reported_active"
  | "quiet"
  | "probably_ended"
  | "stale_unknown"
  | "waiting_user"
  | "blocked"
  | "completed"
  | "failed";
```

Meaning:

- `reported_active`: a recent agent heartbeat/checkpoint exists;
- `quiet`: no recent report, but inactivity is still below the configured resume threshold;
- `probably_ended`: no stronger active signal exists and the active branch has no new commit for the configured interval;
- `stale_unknown`: observations are too old or incomplete to classify confidently;
- `waiting_user`: the agent explicitly requested owner input;
- `blocked`: a persisted blocker and unlock action exist;
- `completed`: an explicit valid completion exists with evidence;
- `failed`: an explicit failure exists.

Default policy:

```text
0–30 minutes without a stronger activity signal: quiet
more than 30 minutes without commits: show an inactivity warning
more than 60 minutes without commits: probably ended
observation older than the configured data-freshness limit: stale unknown
```

All thresholds are owner-configurable per repository, with global defaults. The UI always displays the absolute timestamp, elapsed age, source, and confidence basis.

Suggested Portuguese labels:

```text
reported_active  -> Atividade reportada
quiet            -> Sem atualização recente
probably_ended   -> Sessão provavelmente encerrada
stale_unknown    -> Estado desconhecido
waiting_user     -> Aguardando sua ação
blocked          -> Bloqueado
completed        -> Concluído
failed           -> Falhou
```

Do not use **IA trabalhando agora** unless a current cooperative heartbeat supports that statement.

## 7. Active branch selection

The activity detector uses the repository's persisted accepted `active_branch`. When it is null, it uses the provider default branch only as the documented fallback already defined by the repository model.

A GitHub recommendation may suggest a more recent development branch, but it must not silently change `active_branch`. The owner must accept the recommendation through the existing audited mutation before the branch becomes the canonical target for inactivity classification and continuation prompts.

The UI may show:

- accepted active branch;
- provider default branch;
- newest observed branch recommendation;
- head SHA and commit timestamp;
- observation age;
- a warning when the accepted branch appears older than another observed development line.

## 8. Data model additions

Prefer additive migrations and reuse existing GitHub observations, repositories, development sessions, evidence, and agent runs.

### `project_resume_policies`

```text
id
project_id nullable
repository_id nullable
warning_after_minutes
probably_ended_after_minutes
observation_stale_after_minutes
prompt_template_id nullable
enabled
created_at
updated_at
version
```

Rules:

- one repository policy overrides the project policy;
- the project policy overrides global settings;
- warning and termination thresholds must be positive;
- `probably_ended_after_minutes` must be greater than `warning_after_minutes`;
- updates are owner-only and audited.

### `ai_resume_targets`

```text
id
project_id nullable
label
provider_kind
launch_url
deep_link_template nullable
deep_link_verified_at nullable
enabled
is_default
created_at
updated_at
version
```

Initial `provider_kind` values:

```text
chatgpt
gemini
claude
custom_web
local_agent
generic
```

Rules:

- `launch_url` must use HTTPS, except explicitly approved loopback development URLs;
- URL credentials are forbidden;
- only one enabled default target is allowed in a scope;
- `deep_link_template` remains disabled until its provider behavior is manually verified;
- the baseline flow uses `launch_url` plus clipboard regardless of provider kind.

### `resume_prompt_templates`

```text
id
name
scope
body_template
version_number
active
created_at
updated_at
```

Templates are owner-private, versioned, size-bounded, and rendered only with allowlisted fields.

### `resume_handoffs`

```text
id
project_id
repository_id nullable
agent_run_id nullable
target_id nullable
branch_name nullable
head_commit_sha nullable
activity_status
activity_source
prompt_template_version
prompt_hash
created_at
opened_at nullable
created_by_owner_id
```

The complete prompt body does not need to be stored when a content hash, template version, and referenced source snapshot are sufficient. If prompt bodies are retained, they remain private and follow the configured retention policy.

## 9. Continuation prompt contract

The generated prompt must come from persisted, timestamped data. It must never invent progress, test results, branch selection, or completion state.

Required sections:

1. project name and slug;
2. repository and accepted active branch;
3. latest observed head SHA and commit time;
4. observation age and activity classification;
5. current stage, current position, and next step;
6. open blocker or owner action, when present;
7. latest trustworthy test/evidence status;
8. latest development-session handoff or run resume hint;
9. operating instructions for the new agent;
10. generation timestamp and confidence/source summary.

Default operating instructions should preserve the established development workflow:

```text
Read the repository documentation and inspect the latest state of the accepted active branch before changing code. Continue incomplete work rather than restarting it. Commit and push after each independently useful checkpoint so progress survives environment resets. When a test or tool cannot run in the current environment, document the missing gate and continue with other code-resolvable work. Do not stop after finishing one small feature while meaningful planned work remains.
```

Example output shape:

```text
Continue development of <project> in <repository> from branch <branch>.
The latest observed commit is <sha>, committed at <timestamp>. No newer commit has been observed for <age>, so DevOS classifies the previous session as <classification>; this is an inference, not proof of completion.

Current stage: <stage>
Current position: <position>
Next step: <next step>
Known blocker: <blocker or none>
Latest test evidence: <status and summary>
Previous handoff: <resume hint or none>

<operating instructions>

Context generated at <timestamp> from <sources>, confidence <confidence>.
```

## 10. Owner flow

### Project tracking card

For each active repository, display:

- accepted active branch;
- latest observed commit and abbreviated SHA;
- time since last branch commit;
- latest agent heartbeat/checkpoint age, when available;
- derived activity status;
- data freshness;
- primary action.

Primary actions by state:

```text
reported_active  -> Ver sessão
quiet            -> Ver atividade
probably_ended   -> Continuar desenvolvimento
stale_unknown    -> Atualizar observações
waiting_user     -> Responder pendência
blocked          -> Ver bloqueio
completed        -> Ver resumo
failed           -> Retomar com contexto
```

### “Continuar desenvolvimento” action

1. resolve the current project, repository, branch, observations, stage, evidence, and handoff;
2. validate that the observation is fresh enough or show a warning;
3. render the prompt from the selected versioned template;
4. show a preview with source timestamps and missing-data warnings;
5. copy the prompt to the clipboard after an explicit owner action;
6. create a `resume_handoff` audit record;
7. open the configured target URL in a new tab/window;
8. show a persistent fallback containing the prompt when clipboard or popup permissions fail.

When multiple targets exist, the owner may choose one. The most recently used enabled target may be suggested but must not override an explicit project default.

### Mobile behavior

At compact widths:

- keep branch, status, age, and primary action above the fold;
- use a bottom sheet or dedicated page for prompt preview;
- provide separate **Copiar prompt** and **Abrir destino** actions when browser restrictions prevent a reliable combined action;
- never rely on hover or horizontal tables.

## 11. Provider adapters

Define a small optional interface:

```ts
export interface ResumeTargetAdapter {
  buildLaunch(input: {
    target: AiResumeTarget;
    prompt: string;
  }): Promise<{
    url: string;
    promptDelivery: "clipboard" | "verified_deep_link";
  }>;
}
```

The generic adapter always returns the configured URL and `clipboard` delivery.

Provider-specific adapters may use a prompt-prefilling deep link only when:

- the behavior is officially documented or owner-verified;
- the URL does not expose secrets or private context to unintended parties;
- prompt length limits are enforced;
- the adapter has a tested fallback to clipboard;
- the verification date and provider version are recorded.

No adapter may automate login, scrape the DOM, inject scripts into a provider page, or click Send.

A local browser extension or userscript may be explored as a separate optional project, but the core DevOS feature must remain fully useful without it.

## 12. GitHub observation delivery

Preferred activity update order:

1. authenticated GitHub webhook for `push` and relevant workflow events;
2. scheduled synchronization through the selected host or an external scheduler;
3. owner-triggered refresh;
4. lazy refresh when opening the private project view, subject to rate limits.

Webhook delivery is an adapter concern. The domain consumes normalized immutable observations and must not depend on GitHub-specific payloads.

The product remains correct without background jobs: staleness may be classified lazily from persisted timestamps during reads. A delayed observation must display **state unknown** rather than incorrectly declaring a session ended.

## 13. Hosting and subscription independence

The implementation baseline is a conventional portable web deployment with server-side routes and persistent storage. Suitable adapters may include a Node server, container/VPS, serverless platform, edge platform with compatible storage, or a split frontend/backend deployment.

Required rules:

- no core feature may require ChatGPT Plus;
- no core feature may require ChatGPT Sites;
- no core feature may require a paid OpenAI API;
- no core feature may require one specific AI provider;
- no provider access token is required for the clipboard-and-open flow;
- GitHub credentials remain server-side and read-only unless a separately reviewed mutation feature is introduced;
- deployment-specific webhooks, schedulers, realtime delivery, and storage are adapters behind stable application contracts.

ChatGPT Sites remains only an optional candidate adapter. Documentation must not present it as the primary or assumed host unless the owner explicitly changes this decision after a capability and cost review.

## 14. Security and privacy

- all project activity, branch names, prompts, target URLs, and handoffs are private owner data;
- anonymous routes expose none of this state;
- prompt rendering uses allowlisted fields and size limits;
- URLs reject embedded credentials and unsafe schemes;
- external destinations receive context only through an explicit owner copy/open action;
- private repository names and branches are excluded from notification previews by default;
- every policy change, target change, prompt generation, and handoff is audited;
- GitHub observations remain untrusted input and are normalized before use;
- commit messages are not treated as executable instructions and should not be copied into continuation prompts by default;
- clipboard failures and popup blocking must not cause data loss or repeated hidden actions.

## 15. Error handling

The launcher must provide safe degraded behavior:

- missing branch: request an owner branch decision or use the documented default fallback with a warning;
- missing GitHub observation: generate a limited prompt from persisted session data and label the branch state unverified;
- stale observation: permit generation only with a prominent freshness warning;
- missing target: copy the prompt and offer target configuration;
- clipboard denied: display a selectable prompt field;
- popup blocked: show an explicit external link;
- template rendering failure: do not open the target; log a sanitized error and preserve source state;
- GitHub rate limit: preserve the last observation and show its age;
- concurrent branch/policy change: reject the stale preview and regenerate from the newest version.

## 16. Testing requirements

### Domain tests

- precedence between heartbeats, commits, workflows, and manual handoffs;
- threshold boundaries and owner overrides;
- stale observation behavior;
- no inactivity path produces `completed`;
- accepted branch fallback and recommendation separation;
- deterministic prompt rendering from a fixed snapshot;
- missing-data warnings;
- target URL validation and default uniqueness;
- optimistic concurrency and audit rollback.

### Integration tests

- GitHub push observation updates branch age;
- project view derives `probably_ended` only from fresh observations;
- prompt generation references the accepted branch and exact SHA;
- prompt hash/template version are recorded;
- unauthorized access fails closed;
- clipboard/open flow degrades safely when browser capabilities fail.

### Browser tests

- desktop and 360 px project cards;
- status labels include timestamp and source;
- **Continuar desenvolvimento** preview and confirmation;
- copy success and denied-permission fallback;
- popup-blocked fallback;
- multiple target selection;
- no private markers in public HTML or payloads;
- keyboard and screen-reader accessible actions.

## 17. Delivery sequence

Implement in independent, frequently committed slices:

1. extract generic external-agent terminology from the ChatGPT-specific control-plane contracts;
2. add activity policy and classification domain types/tests;
3. reuse GitHub observations to calculate active-branch age;
4. add resume targets, templates, and handoff persistence;
5. add deterministic prompt rendering and audit events;
6. expose private read/write application services and APIs;
7. add project-card status and prompt preview;
8. add clipboard/open generic adapter;
9. add webhook or scheduled refresh adapter for the selected host;
10. add optional verified provider adapters;
11. reconcile the existing execution-control plan and README terminology;
12. run privacy, domain, integration, build, and browser gates.

Failure to configure a provider adapter must not block the generic clipboard-and-open implementation.

## 18. Acceptance criteria

The feature is accepted when:

- an owner can configure inactivity thresholds per repository;
- DevOS displays the accepted branch, last observed commit, exact age, source, and conservative status;
- no-commit inactivity produces **Sessão provavelmente encerrada**, never an unsupported completion claim;
- a stronger recent heartbeat prevents a false ended classification;
- the owner can preview and copy a deterministic continuation prompt;
- the owner can open an arbitrary configured AI destination independently of ChatGPT Sites or Plus;
- missing deep-link support falls back to clipboard without losing the prompt;
- generated context includes branch, SHA, stage, next step, evidence, timestamp, and confidence;
- public surfaces expose none of the private activity or prompt data;
- all writes and handoffs are audited;
- the implementation remains deployable through conventional host adapters.

## 19. Documentation reconciliation

When implementation begins, update these documents without changing the portability decision:

- `docs/superpowers/plans/2026-08-01-semogtw-chatgpt-execution-control-plane.md` — rename product-facing concepts to external-agent/control-plane terms and reference this spec;
- `ARCHITECTURE.md` — add the activity classifier, prompt renderer, resume target adapter, and GitHub webhook/scheduler boundary;
- `DATA_MODEL.md` — document the additive policy, target, template, and handoff entities;
- `SECURITY.md` — document explicit outbound context disclosure and URL/template validation;
- `RUNBOOK.md` — document target configuration, webhook health, stale observation recovery, and fallback operation;
- `README.md` — describe the provider-independent project continuation capability after it is implemented.

The architecture must continue to describe ChatGPT Sites as optional rather than the primary deployment target.