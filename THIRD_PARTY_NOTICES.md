# Third-Party Notices

This file records external source material that influences SemogSite. It must be updated whenever code, distinctive structure, visual assets, or documentation are imported or materially adapted.

## `krisnarane/pdi-template`

- Repository: `https://github.com/krisnarane/pdi-template`
- Author/account: `krisnarane`
- Commit inspected: `8be932139e913b1ff050b0bf938910abae52a044`
- Commit date: 2026-07-28
- Purpose: selective technical and visual reference for the initial Semogtw web foundation
- License status at inspected commit: no `LICENSE` file was found
- Authorization record: the Semogtw product specification v2.1 states that selective reuse is authorized by the specification owner

### Planned influence

The project may adapt the following concepts after file-level review:

- TanStack Start/Router/Query scaffold and provider composition;
- root document, metadata, 404 and error-boundary patterns;
- responsive navigation behavior;
- accessible form/loading/feedback patterns;
- schema-first server-function validation concepts;
- typed Cloudflare binding patterns only if Cloudflare is later selected;
- ordered SQL migration conventions;
- Vitest setup and focused test organization.

### Explicit exclusions

SemogSite does not adopt:

- PDI terminology, taxonomy or domain schema;
- upstream personal names, profile content, images or seeds;
- literal branding, gradients, text or page identity;
- the raw-password authentication model;
- stateless non-revocable admin sessions;
- direct SQL as the business-rule layer;
- unused dependencies or generated components merely for template fidelity.

### Modification record

No upstream source file has been copied into SemogSite at the time this notice was created. The current repository contains only planning and analysis documents. When implementation begins, this section must list every materially reused file, the corresponding SemogSite destination, and the nature of the changes.

The upstream authors do not endorse SemogSite unless they explicitly state otherwise.