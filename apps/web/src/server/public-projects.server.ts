import type { PublicEditorialDocument } from "@semogtw/contracts";
import type { SqliteDatabase } from "@semogtw/database";
import { getNodeDatabase } from "./node-database.server";
import {
  createPublicEditorialReader,
  type PublicEditorialReader,
  type PublicEditorialRouteResolution,
} from "./public-editorial.server";

export type PublicProjectSummary = Pick<
  PublicEditorialDocument,
  "slug" | "title" | "excerpt" | "tags" | "updatedAt"
>;

export type PublicProjectReader = {
  list(): Promise<readonly PublicProjectSummary[]>;
  findBySlug(slug: string): Promise<PublicEditorialDocument | null>;
  resolveBySlug(slug: string): Promise<PublicEditorialRouteResolution>;
};

function toPublicProjectSummary(
  document: PublicEditorialDocument,
): PublicProjectSummary {
  return {
    slug: document.slug,
    title: document.title,
    excerpt: document.excerpt,
    tags: document.tags,
    updatedAt: document.updatedAt,
  };
}

export function createPublicProjectReader(
  database: SqliteDatabase,
): PublicProjectReader {
  const editorial: PublicEditorialReader = createPublicEditorialReader(database);
  return {
    list: async () =>
      (await editorial.list({ kind: "project", limit: 100 })).map(
        toPublicProjectSummary,
      ),
    findBySlug: (slug) => editorial.findBySlug(slug, "project"),
    resolveBySlug: (slug) => editorial.resolveBySlug(slug, "project"),
  };
}

async function getReader(): Promise<PublicProjectReader | null> {
  const database = await getNodeDatabase();
  return database === null ? null : createPublicProjectReader(database);
}

export async function readPublicProjects(): Promise<
  readonly PublicProjectSummary[]
> {
  const reader = await getReader();
  return reader?.list() ?? [];
}

export async function readPublicProject(
  slug: string,
): Promise<PublicEditorialDocument | null> {
  const reader = await getReader();
  return reader?.findBySlug(slug) ?? null;
}

export async function readPublicProjectRoute(
  slug: string,
): Promise<PublicEditorialRouteResolution> {
  const reader = await getReader();
  return (
    (await reader?.resolveBySlug(slug)) ?? {
      document: null,
      redirectSlug: null,
    }
  );
}
