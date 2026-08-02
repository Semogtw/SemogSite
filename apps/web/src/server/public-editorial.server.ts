import {
  PublicEditorialDocumentSchema,
  type PublicEditorialDocument,
} from "@semogtw/contracts";
import {
  SqlitePublishedEditorialReadModel,
  type PublishedEditorialProjectionKind,
  type SqliteDatabase,
} from "@semogtw/database";
import { getNodeDatabase } from "./node-database.server";

export type PublicEditorialReader = {
  list(input: {
    kind: PublishedEditorialProjectionKind | null;
    limit: number;
  }): Promise<readonly PublicEditorialDocument[]>;
  findBySlug(
    slug: string,
    kind: PublishedEditorialProjectionKind | null,
  ): Promise<PublicEditorialDocument | null>;
};

function validatePublicProjection(value: unknown): PublicEditorialDocument | null {
  const parsed = PublicEditorialDocumentSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

export function createPublicEditorialReader(
  database: SqliteDatabase,
): PublicEditorialReader {
  const readModel = new SqlitePublishedEditorialReadModel(database);

  return {
    list: async (input) =>
      (await readModel.list(input))
        .map(validatePublicProjection)
        .filter(
          (document): document is PublicEditorialDocument => document !== null,
        ),
    findBySlug: async (slug, kind) => {
      const projection = await readModel.findBySlug(slug);
      if (projection === null || (kind !== null && projection.kind !== kind)) {
        return null;
      }
      return validatePublicProjection(projection);
    },
  };
}

async function getReader(): Promise<PublicEditorialReader | null> {
  const database = await getNodeDatabase();
  return database === null ? null : createPublicEditorialReader(database);
}

export async function readPublicEditorial(input: {
  kind: PublishedEditorialProjectionKind | null;
  limit: number;
}): Promise<readonly PublicEditorialDocument[]> {
  const reader = await getReader();
  return reader?.list(input) ?? [];
}

export async function readPublicEditorialBySlug(
  slug: string,
  kind: PublishedEditorialProjectionKind | null,
): Promise<PublicEditorialDocument | null> {
  const reader = await getReader();
  return reader?.findBySlug(slug, kind) ?? null;
}
