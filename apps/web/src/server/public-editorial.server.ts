import {
  PublicEditorialDocumentSchema,
  type PublicEditorialDocument,
} from "@semogtw/contracts";
import {
  SqlitePublishedEditorialReadModel,
  type PublishedEditorialProjectionKind,
  type PublishedEditorialSummary,
  type SqliteDatabase,
} from "@semogtw/database";
import { getNodeDatabase } from "./node-database.server";

export type PublicEditorialSummary = Pick<
  PublicEditorialDocument,
  "kind" | "slug" | "title" | "excerpt" | "tags" | "updatedAt"
>;

export type PublicEditorialRouteResolution = {
  document: PublicEditorialDocument | null;
  redirectSlug: string | null;
};

export type PublicEditorialReader = {
  list(input: {
    kind: PublishedEditorialProjectionKind | null;
    limit: number;
  }): Promise<readonly PublicEditorialDocument[]>;
  listSummaries(input: {
    kind: PublishedEditorialProjectionKind | null;
    limit: number;
  }): Promise<readonly PublicEditorialSummary[]>;
  findBySlug(
    slug: string,
    kind: PublishedEditorialProjectionKind | null,
  ): Promise<PublicEditorialDocument | null>;
  resolveBySlug(
    slug: string,
    kind: PublishedEditorialProjectionKind | null,
  ): Promise<PublicEditorialRouteResolution>;
};

function validatePublicProjection(value: unknown): PublicEditorialDocument | null {
  const parsed = PublicEditorialDocumentSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

function validatePublicSummary(
  value: PublishedEditorialSummary,
): PublicEditorialSummary | null {
  const parsed = PublicEditorialDocumentSchema.pick({
    kind: true,
    slug: true,
    title: true,
    excerpt: true,
    tags: true,
    updatedAt: true,
  }).safeParse(value);
  return parsed.success ? parsed.data : null;
}

export function createPublicEditorialReader(
  database: SqliteDatabase,
): PublicEditorialReader {
  const readModel = new SqlitePublishedEditorialReadModel(database);

  async function resolveBySlug(
    slug: string,
    kind: PublishedEditorialProjectionKind | null,
  ): Promise<PublicEditorialRouteResolution> {
    const projection = await readModel.findBySlug(slug);
    if (projection !== null && (kind === null || projection.kind === kind)) {
      return {
        document: validatePublicProjection(projection),
        redirectSlug: null,
      };
    }

    // Aliases are intentionally kind-bound. A caller that accepts any kind
    // cannot safely decide which public route should receive the redirect.
    if (kind === null) return { document: null, redirectSlug: null };

    const alias = await readModel.resolveRedirect(slug, kind);
    return {
      document: null,
      redirectSlug: alias?.targetSlug ?? null,
    };
  }

  return {
    list: async (input) =>
      (await readModel.list(input))
        .map(validatePublicProjection)
        .filter(
          (document): document is PublicEditorialDocument => document !== null,
        ),
    listSummaries: async (input) =>
      (await readModel.listSummaries(input))
        .map(validatePublicSummary)
        .filter(
          (document): document is PublicEditorialSummary => document !== null,
        ),
    findBySlug: async (slug, kind) =>
      (await resolveBySlug(slug, kind)).document,
    resolveBySlug,
  };
}

async function getReader(): Promise<PublicEditorialReader | null> {
  const database = await getNodeDatabase();
  return database === null ? null : createPublicEditorialReader(database);
}

export async function readPublicEditorial(input: {
  kind: PublishedEditorialProjectionKind | null;
  limit: number;
}): Promise<readonly PublicEditorialSummary[]> {
  const reader = await getReader();
  return reader?.listSummaries(input) ?? [];
}

export async function readPublicEditorialBySlug(
  slug: string,
  kind: PublishedEditorialProjectionKind | null,
): Promise<PublicEditorialDocument | null> {
  const reader = await getReader();
  return reader?.findBySlug(slug, kind) ?? null;
}

export async function readPublicEditorialRoute(
  slug: string,
  kind: PublishedEditorialProjectionKind | null,
): Promise<PublicEditorialRouteResolution> {
  const reader = await getReader();
  return (
    (await reader?.resolveBySlug(slug, kind)) ?? {
      document: null,
      redirectSlug: null,
    }
  );
}
