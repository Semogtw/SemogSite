# ChatGPT Sites Capability Assessment

**Status:** Assessed  
**Assessment date:** 2026-08-01  
**Repository:** `Semogtw/SemogSite`  
**Scope:** ChatGPT Sites as a possible host for the Semogtw public site, Semogtw DevOS, and the planned MCP surface.

## Executive decision

ChatGPT Sites is a credible candidate for the public/editorial surface and for a lightweight, authenticated DevOS backed by hosted storage. It is not yet validated as the sole host for the whole Semogtw platform.

The repository should therefore keep its host-portable architecture:

- use Sites as a candidate primary host for the public editorial site and lightweight application flows;
- use D1 for structured state and R2 for persistent uploaded files if the project is deployed on Sites;
- keep authentication behind `AuthProvider`;
- keep the Hono/API boundary independent of the hosting adapter;
- do not claim that a remote MCP endpoint, webhooks, background jobs, or arbitrary server routes work on Sites until a deployed smoke test proves each one.

This assessment updates the previous “no host selected” posture with evidence, but it does not select a production deployment mode or authorize deployment.

## Evidence available in this session

### Runtime evidence

The current Work runtime exposes Sites operations for:

- creating and editing Sites;
- saving immutable site versions;
- deploying saved versions and checking deployment status;
- listing versions and inspecting site metadata;
- configuring access policies;
- configuring hosted environment variables and secrets;
- attaching and inspecting custom domains;
- inspecting worker logs;
- creating or refreshing a source-repository credential.

The Sites connector returned **zero Sites accessible to this account in the current session**. No existing Semogtw Sites project, bound source repository, deployment URL, version, custom domain, storage binding, or hosted environment configuration was available to inspect. These are capability-surface observations, not proof that the account can publish every feature in every workspace or region.

### Official documentation evidence

The primary references consulted were:

- [Sites developer guide](https://developers.openai.com/codex/sites) (currently served through ChatGPT Learn);
- [Creating and managing ChatGPT Sites](https://help.openai.com/en/articles/20001339-creating-and-managing-chatgpt-sites);
- [Understanding responsibilities for ChatGPT Sites](https://help.openai.com/en/articles/20001337-understanding-responsibilities-for-your-chatgpt-sites);
- [ChatGPT Sites data-protection guidance](https://help.openai.com/en/articles/20001340-chatgpt-sites-complying-with-data-protection-laws);
- [Developer mode and MCP apps in ChatGPT](https://help.openai.com/en/articles/12584461-developer-mode-and-mcp-apps-in-chatgpt).

The official material describes Sites as a public-beta managed host for websites, web apps, and games, including full-stack JavaScript/TypeScript experiences. Availability, limits, sharing controls, custom domains, and some features depend on account, plan, region, and workspace policy.

## Capability inventory

| Capability | Evidence | Project impact |
|---|---|---|
| Static/editorial websites | Officially supported | Strong fit for the public Semogtw editorial surface. |
| Interactive web apps and games | Officially supported | Suitable for dashboards, trackers, portals, reports, and similar lightweight tools. |
| Full-stack JavaScript/TypeScript | Documented for the Sites use-case flow | Makes a lightweight DevOS plausible, subject to runtime-compatible code and route testing. |
| Durable structured data | D1 is documented as SQLite-compatible storage | Strong fit for projects, stages, sessions, evidence metadata, settings, and other structured state. |
| Persistent file uploads | R2 is documented for images, documents, audio, video, and other file bytes | Strong fit for editorial assets and evidence files; keep metadata in D1 and bytes in R2. |
| Optional ChatGPT identity | Sign in with ChatGPT paths and server headers are documented | Useful for workspace/private access and optional identity-aware public features. Authorization must remain server-side. |
| Custom application authentication | Documentation allows an intentionally added Site sign-in feature, but does not define the complete contract for arbitrary auth providers | Keep `AuthProvider`; validate the exact provider and session model before replacing the planned local adapter. |
| Hosted environment variables and secrets | Supported through Site settings; secrets must not be committed or placed in `.openai/hosting.json` | Suitable for API credentials and runtime configuration. Require redeployment of the approved saved version after changes. |
| Versioned publishing | Save-version and deploy-version stages are documented; each deployment URL is production | Matches the repository’s requirement to preserve a reviewed version before publishing. |
| Source/Git association | Local source projects can be associated with a Git commit used for the build | Compatible with the repository workflow, but the current Semogtw repo is not bound to a Sites project in this session. |
| Custom domain | Supported where available for an already-owned apex domain or subdomain; DNS changes are required | Potentially satisfies the domain requirement. Availability must be verified on the actual account/workspace. |
| Traffic analytics | Unique visitors and page views are documented; availability currently excludes Enterprise-owned Sites | Useful for the public site if available, but not a portable product dependency. |
| Server-side identity headers | Documented for Sign in with ChatGPT | Supports server-side authorization decisions; do not trust client-provided identity values. |
| External API integrations | The official use-case guide describes API keys in Site settings and connected-plugin workflows | Possible for selected integrations; each external API, CORS policy, rate limit, and failure mode still needs a direct test. |
| Remote MCP endpoint | Not documented as a Sites capability | Do not mark the planned MCP surface as compatible. ChatGPT custom MCP apps require a real remote endpoint and independently configured app/developer-mode flow. |
| Arbitrary versioned Hono API | Full-stack/server behavior is plausible, but the public Sites documentation does not guarantee arbitrary framework routing or a permanent API contract | Keep Hono as an adapter boundary and run a deployed route smoke test before relying on it. |
| Webhooks | No Sites webhook capability was found in the official Sites documentation | Treat as unsupported/unverified; do not make inbound webhooks a required MVP dependency. |
| Background jobs/daemons | The official guide warns that background services and some hosting patterns may not be supported | Treat as unavailable until direct evidence proves otherwise. Use an external scheduler or separate host if reconciliation is required. |
| Private network access | The official Sites documentation warns that private networks may not be supported | Do not assume access to local services, private databases, or LAN-only APIs. |
| Data residency | Not supported at launch for deployed Sites, code, D1/R2 data, artifacts, and logs | Not compatible with a requirement for regional/data residency guarantees. |
| Sensitive regulated data | PHI and payment-card data are prohibited; other privacy obligations remain with the Site operator | Keep Semogtw free of payment-card data and highly sensitive records. Add privacy notice and data-minimization controls for visitor data. |

## Compatibility with Semogtw requirements

| Semogtw requirement | Assessment | Decision |
|---|---|---|
| Public editorial site | **Compatible** | Sites may be the primary host candidate. |
| Semogtw DevOS with projects, stages, roadmap, sessions, and evidence metadata | **Compatible with conditions** | Use D1; keep domain/application contracts host-independent; test migrations and authorization in a real Site. |
| Persistent uploads | **Compatible with conditions** | Use R2 for bytes and D1 for metadata; test upload limits, content validation, authorization, and deletion behavior. |
| Private owner/workspace access | **Conditionally compatible** | Use Site access controls and/or Sign in with ChatGPT where they match the intended audience. Do not assume they replace revocable application sessions. |
| Dedicated local authentication provider | **Unverified** | Preserve the `AuthProvider` abstraction and validate the exact Sites-compatible implementation before committing to it. |
| Public/private DTO isolation | **Compatible** | This is an application architecture concern and remains mandatory regardless of host. |
| Hono versioned API | **Conditionally compatible** | Keep it behind an adapter; prove the required routes, methods, headers, body limits, and error behavior after deployment. |
| Remote MCP on the same domain | **Not established** | Keep MCP as a separate deployable surface until a real HTTPS MCP endpoint and domain-verification flow are proven. |
| Webhooks and scheduled reconciliation | **Not established** | Keep external scheduler/webhook adapters optional; do not make them part of the Sites-only MVP. |
| Custom domain | **Conditionally compatible** | Verify availability and DNS instructions on the actual Sites project before selecting a domain-facing mode. |
| Figma, Supericons, Canva, and editorial tooling | **Compatible** | These are build/design workflows and do not constrain the hosting decision. |
| Frequent Git commits and reviewed deployments | **Compatible** | Save a version only from the intended commit and deploy only after review. |
| Host portability | **Required** | Sites must remain an adapter, not leak into domain packages or define the only API/storage contract. |

## Recommended architecture posture

The current architecture should be retained with one clarification:

```text
Semogtw domain/contracts/auth
            |
      host-independent services
        /                 \
Sites adapter          alternative host adapter
(public + DevOS)       (API, jobs, or MCP if needed)
        |
       D1 / R2
```

The MCP plan should be treated as a separate deployment decision. A Site may eventually serve a compatible HTTP route, but that is an inference requiring a deployed compatibility test, not a documented Sites guarantee. The safer baseline is:

- public/editorial and lightweight DevOS on Sites if the real project passes build, storage, auth, and route gates;
- MCP on a separately verified HTTPS service unless Sites proves a stable MCP-compatible endpoint;
- background reconciliation and webhooks on a separate scheduler/host unless Sites documents or demonstrates them.

## Required validation before choosing Sites as production host

1. Create or associate a non-production Sites project from the SemogSite source.
2. Confirm the project can build from the intended branch and preserves the expected commit/version relationship.
3. Run a public anonymous smoke test for editorial routes.
4. Run D1 migration, read/write, transaction, and concurrency checks.
5. Run R2 upload, metadata, authorization, size/type, and deletion checks.
6. Test Sign in with ChatGPT and the intended private-access policy from both anonymous and authenticated browsers.
7. Test every required server/API route, including CORS, cookies, headers, streaming/long responses if used, and error handling.
8. Test the custom-domain flow on the actual account, including HTTPS and the canonical URL.
9. Attempt the MCP endpoint only as an explicit experiment; do not expose a production claim until an external MCP client can discover and invoke the approved tools.
10. Verify that no required webhook or background process is silently assumed.
11. Save a version, inspect it, and only then deploy it.
12. Record the observed result, URLs, version, storage bindings, access mode, and limitations in this document.

## Current decision record

- **Sites capability:** available in the current Work runtime, but no Site project is accessible in this session.
- **Candidate role:** primary host candidate for public/editorial content and lightweight D1/R2-backed DevOS.
- **Not yet accepted:** remote MCP, arbitrary production API contract, webhooks, background jobs, private-network dependencies, and data-residency requirements.
- **Deployment mode:** not selected by this assessment.
- **Next gate:** create/associate a non-production Site and run the validation checklist above before changing the repository’s host-agnostic contract.

