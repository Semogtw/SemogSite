import { PublicEditorialDocumentSchema } from "@semogtw/contracts";
import type { D1DatabaseBinding } from "../adapters/d1";
import type {
  PublishedEditorialProjection,
  PublishedEditorialProjectionKind,
  PublishedEditorialRedirect,
  PublishedEditorialSummary,
} from "./published-editorial-read-model";

type ProjectionRow = {
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

type SummaryRow = {
  kind: PublishedEditorialProjectionKind;
  slug: string;
  title: string;
  excerpt: string;
  tags_json: string;
  published_at: string;
};

const slugPattern = /^[a-z0-9](?:[a-z0-9-]{0,118}[a-z0-9])?$/u;
const kinds = new Set<PublishedEditorialProjectionKind>([
  "project",
  "note",
  "experiment",
  "page",
]);
const PublicEditorialSummarySchema = PublicEditorialDocumentSchema.pick({
  kind: true,
  slug: true,
  title: true,
  excerpt: true,
  tags: true,
  updatedAt: true,
});

function parseTags(value: string): unknown {
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return null;
  }
}

function normalizeLimit(value: number): number {
  if (!Number.isFinite(value)) return 20;
  return Math.min(100, Math.max(1, Math.floor(value)));
}

function normalizeDate(value: string): string | null {
  const timestamp = Date.parse(value);
  return Number.isNaN(timestamp) ? null : new Date(timestamp).toISOString();
}

function toProjection(row: ProjectionRow): PublishedEditorialProjection | null {
  const updatedAt = normalizeDate(row.published_at);
  if (updatedAt === null) return null;

  const parsed = PublicEditorialDocumentSchema.safeParse({
    kind: row.kind,
    slug: row.slug,
    title: row.title,
    excerpt: row.excerpt,
    bodyMarkdown: row.body_markdown,
    tags: parseTags(row.tags_json),
    contentHash: row.content_hash,
    publishedRevisionId: row.published_revision_id,
    updatedAt,
  });
  return parsed.success ? parsed.data : null;
}

function toSummary(row: SummaryRow): PublishedEditorialSummary | null {
  const updatedAt = normalizeDate(row.published_at);
  if (updatedAt === null) return null;

  const parsed = PublicEditorialSummarySchema.safeParse({
    kind: row.kind,
    slug: row.slug,
    title: row.title,
    excerpt: row.excerpt,
    tags: parseTags(row.tags_json),
    updatedAt,
  });
  return parsed.success ? parsed.data : null;
}

const publishedJoin = `
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
  ${publishedJoin}`;

const selectPublishedSummary = `
  SELECT document.kind,
         document.slug,
         revision.title,
         revision.excerpt,
         revision.tags_json,
         publication.occurred_at AS published_at
  ${publishedJoin}`;

export class D1PublishedEditorialReadModel {
  constructor(private readonly database: D1DatabaseBinding) {}

  async findBySlug(
    slugValue: string,
  ): Promise<PublishedEditorialProjection | null> {
    const slug = slugValue.trim().toLowerCase();
    if (!slugPattern.test(slug)) return null;

    const row = await this.database
      .prepare(`${selectPublished} AND document.slug = ? LIMIT 1`)
      .bind(slug)
      .first<ProjectionRow>();
    return row === null ? null : toProjection(row);
  }

  async resolveRedirect(
    sourceSlugValue: string,
    kind: PublishedEditorialProjectionKind,
  ): Promise<PublishedEditorialRedirect | null> {
    const sourceSlug = sourceSlugValue.trim().toLowerCase();
    if (!slugPattern.test(sourceSlug) || !kinds.has(kind)) return null;

    const row = await this.database
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
      .bind(sourceSlug, kind)
      .first<{ target_slug: string }>();

    return row === null || !slugPattern.test(row.target_slug)
      ? null
      : { targetSlug: row.target_slug };
  }

  async list(input: {
    kind: PublishedEditorialProjectionKind | null;
    limit: number;
  }): Promise<readonly PublishedEditorialProjection[]> {
    if (input.kind !== null && !kinds.has(input.kind)) return [];
    const limit = normalizeLimit(input.limit);
    const statement =
      input.kind === null
        ? this.database
            .prepare(
              `${selectPublished}
               ORDER BY publication.occurred_at DESC, document.slug ASC
               LIMIT ?`,
            )
            .bind(limit)
        : this.database
            .prepare(
              `${selectPublished}
               AND document.kind = ?
               ORDER BY publication.occurred_at DESC, document.slug ASC
               LIMIT ?`,
            )
            .bind(input.kind, limit);
    const result = await statement.all<ProjectionRow>();
    return result.results
      .map(toProjection)
      .filter(
        (item): item is PublishedEditorialProjection => item !== null,
      );
  }

  async listSummaries(input: {
    kind: PublishedEditorialProjectionKind | null;
    limit: number;
  }): Promise<readonly PublishedEditorialSummary[]> {
    if (input.kind !== null && !kinds.has(input.kind)) return [];
    const limit = normalizeLimit(input.limit);
    const statement =
      input.kind === null
        ? this.database
            .prepare(
              `${selectPublishedSummary}
               ORDER BY publication.occurred_at DESC, document.slug ASC
               LIMIT ?`,
            )
            .bind(limit)
        : this.database
            .prepare(
              `${selectPublishedSummary}
               AND document.kind = ?
               ORDER BY publication.occurred_at DESC, document.slug ASC
               LIMIT ?`,
            )
            .bind(input.kind, limit);
    const result = await statement.all<SummaryRow>();
    return result.results
      .map(toSummary)
      .filter((item): item is PublishedEditorialSummary => item !== null);
  }
}
