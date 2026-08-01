# Public Site

## Purpose

The public surface presents Semogtw, approved projects, trajectory, laboratory experiments, technical notes, stack and contact channels. It is an editorial projection of shared domain data, not a public view of the DevOS database.

## Routes

| Route | State in foundation |
|---|---|
| `/` | editorial home implemented with honest empty project state |
| `/about` | meaningful structure; copy pending approval |
| `/projects` | public catalog structure; no approved records yet |
| `/projects/:slug` | unpublished boundary; no private fallback; `noindex` |
| `/journey` | timeline structure; entries pending approval |
| `/lab` | experiment catalog structure |
| `/notes` | publication catalog structure |
| `/notes/:slug` | unpublished boundary; no private fallback; `noindex` |
| `/stack` | evidence-oriented technology structure |
| `/contact` | approved-channel structure |

## Visibility

- `public`: listed, indexable and eligible for sitemap;
- `unlisted`: available by exact URL, absent from listings and sitemap;
- `private`: unavailable to public routes and APIs.

Visibility alone is not enough. A project must also have an approved public summary before serialization.

## Data path

```text
private-capable storage
  → Publishing/Public query service
  → allowlisted public DTO
  → public loader/API
  → HTML and metadata
```

The public layer must never receive a complete private entity for later field removal.

## Metadata and SEO

Before public deployment:

- unique title and description per route;
- canonical URL derived from verified public base URL;
- Open Graph only from public assets and summaries;
- sitemap only from `public` items;
- no private/unlisted entries in structured data;
- useful 404;
- dynamic unpublished routes `noindex`;
- semantic HTML and alt text;
- public preview must equal final payload.

## Empty states

The foundation intentionally displays approved-empty states. It does not fill the site with demo projects, inferred biography, private GitHub data or unpublished session summaries.

## Confidentiality gate

Anonymous checks must search for:

- private repository names and URLs;
- branch names;
- blockers and private next steps;
- session/evidence details;
- audit fields;
- token/key patterns;
- upstream personal names and PDI copy.

The check covers HTML, loader payloads, API bodies, metadata, sitemap, robots, cache artifacts and logs.

## Mobile

The primary acceptance width is 360 px. The site has a compact header, 44 px interaction targets, no required tables, no horizontal page overflow and reduced-motion support.
