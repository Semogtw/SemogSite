import {
  PublicEditorialDocumentSchema,
  type PublicEditorialDocument,
} from "@semogtw/contracts";
import { getRequest } from "@tanstack/react-start/server";
import { z } from "zod";

export type PublicEditorialKind = PublicEditorialDocument["kind"];
export type PublicEditorialSummary = Pick<
  PublicEditorialDocument,
  "kind" | "slug" | "title" | "excerpt" | "tags" | "updatedAt"
>;
export type PublicEditorialRouteResolution = {
  document: PublicEditorialDocument | null;
  redirectSlug: string | null;
};

const kinds: readonly PublicEditorialKind[] = [
  "project",
  "note",
  "experiment",
  "page",
];
const summarySchema = PublicEditorialDocumentSchema.pick({
  kind: true,
  slug: true,
  title: true,
  excerpt: true,
  tags: true,
  updatedAt: true,
});
const summaryEnvelopeSchema = z.object({
  ok: z.literal(true),
  data: z.array(summarySchema),
});
const documentEnvelopeSchema = z.object({
  ok: z.literal(true),
  data: PublicEditorialDocumentSchema,
});

function apiUrl(path: string): URL {
  return new URL(path, getRequest().url);
}

async function readJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    throw new Error("PUBLIC_EDITORIAL_API_INVALID_JSON");
  }
}

async function listKind(
  kind: PublicEditorialKind,
  limit: number,
): Promise<readonly PublicEditorialSummary[]> {
  const response = await fetch(
    apiUrl(
      `/api/v1/public/editorial/${encodeURIComponent(kind)}?limit=${encodeURIComponent(String(limit))}`,
    ),
    { headers: { accept: "application/json" } },
  );
  if (!response.ok) throw new Error(`PUBLIC_EDITORIAL_API_LIST_${response.status}`);
  return summaryEnvelopeSchema.parse(await readJson(response)).data;
}

export async function readPublicEditorialFromApi(input: {
  kind: PublicEditorialKind | null;
  limit: number;
}): Promise<readonly PublicEditorialSummary[]> {
  if (input.kind !== null) return listKind(input.kind, input.limit);

  const documents = (await Promise.all(kinds.map((kind) => listKind(kind, input.limit))))
    .flat()
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
  return documents.slice(0, input.limit);
}

function redirectSlugFromLocation(
  location: string | null,
  kind: PublicEditorialKind,
): string | null {
  if (location === null) return null;
  const url = new URL(location, getRequest().url);
  const prefix = `/api/v1/public/editorial/${encodeURIComponent(kind)}/`;
  if (!url.pathname.startsWith(prefix)) return null;
  const encodedSlug = url.pathname.slice(prefix.length);
  if (encodedSlug.length === 0 || encodedSlug.includes("/")) return null;
  try {
    return decodeURIComponent(encodedSlug);
  } catch {
    return null;
  }
}

export async function readPublicEditorialRouteFromApi(
  slug: string,
  kind: PublicEditorialKind,
): Promise<PublicEditorialRouteResolution> {
  const response = await fetch(
    apiUrl(
      `/api/v1/public/editorial/${encodeURIComponent(kind)}/${encodeURIComponent(slug)}`,
    ),
    {
      headers: { accept: "application/json" },
      redirect: "manual",
    },
  );

  if (response.status === 404) return { document: null, redirectSlug: null };
  if (response.status === 308) {
    const redirectSlug = redirectSlugFromLocation(response.headers.get("location"), kind);
    if (redirectSlug === null) throw new Error("PUBLIC_EDITORIAL_API_REDIRECT_INVALID");
    return { document: null, redirectSlug };
  }
  if (!response.ok) throw new Error(`PUBLIC_EDITORIAL_API_DOCUMENT_${response.status}`);

  const document = documentEnvelopeSchema.parse(await readJson(response)).data;
  if (document.kind !== kind) throw new Error("PUBLIC_EDITORIAL_API_KIND_MISMATCH");
  return { document, redirectSlug: null };
}

export async function readPublicEditorialBySlugFromApi(
  slug: string,
  kind: PublicEditorialKind,
): Promise<PublicEditorialDocument | null> {
  return (await readPublicEditorialRouteFromApi(slug, kind)).document;
}
