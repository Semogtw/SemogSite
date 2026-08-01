# Public Site

## Purpose

The public surface presents Semogtw, approved projects, trajectory, laboratory experiments, technical notes, stack and contact channels. It is an editorial projection of shared domain data, not a public view of the DevOS database.

## Routes

| Route | State in foundation |
|---|---|
| `/` | editorial home with approved featured-project projection |
| `/about` | meaningful structure; copy pending approval |
| `/projects` | live SQLite-backed catalog of approved `public` records |
| `/projects/:slug` | live public/unlisted detail; unpublished routes remain neutral and `noindex` |
| `/journey` | timeline structure; entries pending approval |
| `/lab` | experiment catalog structure |
| `/notes` | publication catalog structure |
| `/notes/:slug` | unpublished boundary; no private fallback; `noindex` |
| `/stack` | evidence-oriented technology structure |
| `/contact` | approved-channel structure |

## Visibility

- `public`: listed, indexable and eligible for sitemap;
- `unlisted`: available by exact URL, absent from listings, home and sitemap;
- `private`: unavailable to public routes and APIs.

Visibility alone is not enough. A project must also have a non-null approved public summary before it reaches a serializer.

## Current project data path

```text
SQLite projects
  → SqlitePublicProjectSource
  → toPublicProjectDto (explicit allowlist)
  → TanStack server function
  → public loader
  → HTML and metadata
```

The database source may know operational fields because it reads the canonical record. The value returned by `readPublicProjects` and `readPublicProjectBySlug` is already a `PublicProjectDto`; no private-capable source crosses the server-function boundary.

Current deliberate decisions:

- `lastActivityAt` is not reused as `lastPublicActivityAt`;
- the foundation returns public activity as `null` until a dedicated approved field exists;
- private seed records are excluded even when their slug is requested exactly;
- home uses only records with `featured = true` after public serialization;
- unknown project slugs never fall back to DevOS data.

## Metadata and SEO

Implemented:

- unique project-list title and description;
- published project title/description derived only from the public DTO;
- unpublished dynamic projects marked `noindex, nofollow`;
- `robots.txt` excludes private route prefixes;
- semantic public project cards and safe external link attributes.

Still required before public deployment:

- canonical URL derived from verified public base URL;
- Open Graph only from public assets and summaries;
- sitemap generated only from `public` items;
- no private/unlisted entries in structured data;
- anonymous build inspection of HTML and loader payloads;
- final editorial copy and approved contact channels.

## Empty states

The foundation intentionally displays approved-empty states when the database contains no publishable records. It does not fill the site with demo projects, inferred biography, private GitHub data or unpublished session summaries.

The bundled `seed_demo` project is private, so a fresh local database produces an empty public catalog while populating the authenticated DevOS read models.

## Confidentiality gate

Anonymous checks must search for:

- private repository names and URLs;
- branch names;
- blockers and private next steps;
- session/evidence details;
- audit fields;
- token/key patterns;
- upstream personal names and PDI copy.

The static scanner covers public route/component/API source and public assets. The release gate must additionally inspect generated HTML, loader payloads, API bodies, metadata, sitemap, cache artifacts and logs.

## Mobile

The primary acceptance width is 360 px. The site has a compact functional menu, 44 px interaction targets, responsive project grids, no required tables, no horizontal page overflow by design and reduced-motion support. Browser observation is still required before acceptance.
