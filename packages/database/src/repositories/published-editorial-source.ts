import type { SqliteDatabase } from "../adapters/sqlite";

export type PublishedEditorialKind = "project" | "note" | "experiment" | "page";

export type PublishedEditorialRecord = {
  kind: PublishedEditorialKind;
  slug: string;
  title: string;
  excerpt: string;
  bodyMarkdown: string;
  tags: readonly string[];
  contentHash: string;
  publishedRevisionId: string;
  updatedAt: string;
};

type PublishedEditorialRow = {
  kind: PublishedEditorialKind;
  slug: string;
  title: string;
  excerpt: string;
  body_markdown: string;
  tags_json: string;
  content_hash: string;
  published_revision_id: string;
  updated_at: string;
};

const slugPattern = /^[a-z0-9](?:[a-z0-9-]{0,118}[a-z0-9])?$/u;
const hashPattern = /^[a-f0-9]{64}$/u;
const tagPattern = /^[a-z0-9](?:[a-z0-9-]{0,38}[a-z0-9])?$/u;
const rawHtmlPattern = /<\/?[a-z][^>]*>/iu;
const validKinds = new Set<PublishedEditorialKind>([
  "project",
  "note",
  "experiment",
  "page",
]);

function normalizeLimit(value: number): number {
  if (!Number.isFinite(value)) return 20;
  return Math.min(100, Math.max(1, Math.floor(value)));
}

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

function toPublishedRecord(
  row: PublishedEditorialRow,
): PublishedEditorialRecord | null {
  const tags = parseTags(row.tags_json);
  if (
    !validKinds.has(row.kind) ||
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
    Number.isNaN(Date.parse(row.updated_at))
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
    updatedAt: new Date(Date.parse(row.updated_at)).toISOString(),
  };
}

const publishedSelect = `
  SELECT document.kind,
         document.slug,
         revision.title,
         revision.excerpt,
         revision.body_markdown,
         revision.tags_json,
         revision.content_hash,
         document.published_revision_id,
         document.updated_at
  FROM editorial_documents AS document
  JOIN editorial_revisions AS revision
    ON revision.id = document.published_revision_id
   AND revision.document_id = document.id
  WHERE document.publication_status = 'published'
    AND document.published_revision_id IS NOT NULL`;

export class SqlitePublishedEditorialSource {
  constructor(private readonly database: SqliteDatabase) {}

  async findBySlug(slugValue: string): Promise<PublishedEditorialRecord | null> {
    const slug = slugValue.trim().toLowerCase();
    if (!slugPattern.test(slug)) return null;

    const row = this.database.$client
      .prepare(`${publishedSelect} AND document.slug = ? LIMIT 1`)
      .get(slug) as PublishedEditorialRow | undefined;
    return row === undefined ? null : toPublishedRecord(row);
  }

  async listPublished(input: {
    kind: PublishedEditorialKind | null;
    limit: number;
  }): Promise<readonly PublishedEditorialRecord[]> {
    const limit = normalizeLimit(input.limit);
    if (input.kind !== null && !validKinds.has(input.kind)) return [];

    const rows = (
      input.kind === null
        ? this.database.$client
            .prepare(
              `${publishedSelect}
               ORDER BY document.updated_at DESC, document.slug ASC
               LIMIT ?`,
            )
            .all(limit)
        : this.database.$client
            .prepare(
              `${publishedSelect}
               AND document.kind = ?
               ORDER BY document.updated_at DESC, document.slug ASC
               LIMIT ?`,
            )
            .all(input.kind, limit)
    ) as PublishedEditorialRow[];

    return rows
      .map(toPublishedRecord)
      .filter((record): record is PublishedEditorialRecord => record !== null);
  }
}
