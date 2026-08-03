import type { SqliteDatabase } from "../adapters/sqlite";

export type PublishedEditorialProjectionKind =
  | "project"
  | "note"
  | "experiment"
  | "page";


export type PublishedEditorialRedirect = {
  targetSlug: string;
};

export type PublishedEditorialProjection = {
  kind: PublishedEditorialProjectionKind;
  slug: string;
  title: string;
  excerpt: string;
  bodyMarkdown: string;
  tags: readonly string[];
  contentHash: string;
  publishedRevisionId: string;
  updatedAt: string;
};

type Row = {
  kind: PublishedEditorialProjectionKind;
  slug: string;
  title: string;
  excerpt: string;
  body_markdown: string;
  tags_json: string;
  content_hash: string;
  published_revision_id: string;
  published_at: string;
};

const slugPattern = /^[a-z0-9](?:[a-z0-9-]{0,118}[a-z0-9])?$/u;
const hashPattern = /^[a-f0-9]{64}$/u;
const tagPattern = /^[a-z0-9](?:[a-z0-9-]{0,38}[a-z0-9])?$/u;
const rawHtmlPattern = /<\/?[a-z][^>]*>/iu;
const kinds = new Set<PublishedEditorialProjectionKind>([
  "project",
  "note",
  "experiment",
  "page",
]);

function parseTags(value: string): readonly string[] | null {
  try {
    const parsed = JSON.parse(value) as unknown;
    if (
      !Array.isArray(parsed) ||
      parsed.length > 12 ||
      !parsed.every(
        (tag) => typeof tag === "string" && tagPattern.test(tag),
      )
    ) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function normalizeLimit(value: number): number {
  if (!Number.isFinite(value)) return 20;
  return Math.min(100, Math.max(1, Math.floor(value)));
}

function project(row: Row): PublishedEditorialProjection | null {
  const tags = parseTags(row.tags_json);
  if (
    !kinds.has(row.kind) ||
    !slugPattern.test(row.slug) ||
    row.title.trim().length === 0 ||
    row.title.length > 160 ||
    row.excerpt.trim().length === 0 ||
    row.excerpt.length > 320 ||
    row.body_markdown.trim().length === 0 ||
    row.body_markdown.length > 100_000 ||
    rawHtmlPattern.test(row.body_markdown) ||
    tags === null ||
    !hashPattern.test(row.content_hash) ||
    row.published_revision_id.trim().length === 0 ||
    Number.isNaN(Date.parse(row.published_at))
  ) {
    return null;
  }

  return {
    kind: row.kind,
    slug: row.slug,
    title: row.title,
    excerpt: row.excerpt,
    bodyMarkdown: row.body_markdown,
    tags,
    contentHash: row.content_hash,
    publishedRevisionId: row.published_revision_id,
    updatedAt: new Date(Date.parse(row.published_at)).toISOString(),
  };
}

const selectPublished = `
  SELECT document.kind,
         document.slug,
         revision.title,
         revision.excerpt,
         revision.body_markdown,
         revision.tags_json,
         revision.content_hash,
         document.published_revision_id,
         publication.occurred_at AS published_at
  FROM editorial_documents AS document
  JOIN editorial_revisions AS revision
    ON revision.id = document.published_revision_id
   AND revision.document_id = document.id
  JOIN editorial_events AS publication
    ON publication.document_id = document.id
   AND publication.revision_id = document.published_revision_id
   AND publication.kind IN ('editorial.published', 'editorial.rolled_back')
   AND publication.sequence = (
     SELECT MAX(candidate.sequence)
     FROM editorial_events AS candidate
     WHERE candidate.document_id = document.id
       AND candidate.revision_id = document.published_revision_id
       AND candidate.kind IN ('editorial.published', 'editorial.rolled_back')
   )
  WHERE document.publication_status = 'published'
    AND document.published_revision_id IS NOT NULL`;

export class SqlitePublishedEditorialReadModel {
  constructor(private readonly database: SqliteDatabase) {}

  async findBySlug(
    slugValue: string,
  ): Promise<PublishedEditorialProjection | null> {
    const slug = slugValue.trim().toLowerCase();
    if (!slugPattern.test(slug)) return null;

    const row = this.database.$client
      .prepare(`${selectPublished} AND document.slug = ? LIMIT 1`)
      .get(slug) as Row | undefined;
    return row === undefined ? null : project(row);
  }

  async resolveRedirect(
    sourceSlugValue: string,
    kind: PublishedEditorialProjectionKind,
  ): Promise<PublishedEditorialRedirect | null> {
    const sourceSlug = sourceSlugValue.trim().toLowerCase();
    if (!slugPattern.test(sourceSlug) || !kinds.has(kind)) return null;

    const row = this.database.$client
      .prepare(
        `SELECT target.slug AS target_slug
         FROM editorial_redirect_events AS redirect
         JOIN editorial_documents AS target
           ON target.id = redirect.target_document_id
          AND target.kind = redirect.kind
         WHERE redirect.source_slug = ?
           AND redirect.kind = ?
           AND redirect.action = 'created'
           AND redirect.sequence = (
             SELECT MAX(candidate.sequence)
             FROM editorial_redirect_events AS candidate
             WHERE candidate.source_slug = redirect.source_slug
           )
           AND target.publication_status = 'published'
           AND target.published_revision_id IS NOT NULL
           AND target.slug <> redirect.source_slug
         LIMIT 1`,
      )
      .get(sourceSlug, kind) as { target_slug: string } | undefined;

    return row === undefined || !slugPattern.test(row.target_slug)
      ? null
      : { targetSlug: row.target_slug };
  }

  async list(input: {
    kind: PublishedEditorialProjectionKind | null;
    limit: number;
  }): Promise<readonly PublishedEditorialProjection[]> {
    if (input.kind !== null && !kinds.has(input.kind)) return [];
    const limit = normalizeLimit(input.limit);
    const rows = (
      input.kind === null
        ? this.database.$client
            .prepare(
              `${selectPublished}
               ORDER BY publication.occurred_at DESC, document.slug ASC
               LIMIT ?`,
            )
            .all(limit)
        : this.database.$client
            .prepare(
              `${selectPublished}
               AND document.kind = ?
               ORDER BY publication.occurred_at DESC, document.slug ASC
               LIMIT ?`,
            )
            .all(input.kind, limit)
    ) as Row[];

    return rows
      .map(project)
      .filter(
        (item): item is PublishedEditorialProjection => item !== null,
      );
  }
}
