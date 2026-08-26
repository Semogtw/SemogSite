import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import {
  readPublicEditorialBySlugFromApi,
  readPublicEditorialFromApi,
  readPublicEditorialRouteFromApi,
  type PublicEditorialKind,
  type PublicEditorialRouteResolution,
} from "./public-editorial-api.server";

const PublicEditorialKindSchema = z.enum([
  "project",
  "note",
  "experiment",
  "page",
]);
const publicEditorialKinds: readonly PublicEditorialKind[] = [
  "project",
  "note",
  "experiment",
  "page",
];

const PublicEditorialDocumentInputSchema = z.object({
  slug: z.string().trim().min(1).max(120),
  kind: PublicEditorialKindSchema.nullable(),
});

async function readDocument(slug: string, kind: PublicEditorialKind | null) {
  if (kind !== null) return readPublicEditorialBySlugFromApi(slug, kind);
  for (const candidate of publicEditorialKinds) {
    const document = await readPublicEditorialBySlugFromApi(slug, candidate);
    if (document !== null) return document;
  }
  return null;
}

async function readRoute(
  slug: string,
  kind: PublicEditorialKind | null,
): Promise<PublicEditorialRouteResolution> {
  if (kind !== null) return readPublicEditorialRouteFromApi(slug, kind);
  const document = await readDocument(slug, null);
  return { document, redirectSlug: null };
}

export const getPublicEditorialFn = createServerFn({ method: "GET" })
  .validator(
    z.object({
      kind: PublicEditorialKindSchema.nullable(),
      limit: z.number().int().min(1).max(100),
    }),
  )
  .handler(({ data }) => readPublicEditorialFromApi(data));

export const getPublicEditorialDocumentFn = createServerFn({ method: "GET" })
  .validator(PublicEditorialDocumentInputSchema)
  .handler(({ data }) => readDocument(data.slug, data.kind));

export const getPublicEditorialDocumentRouteFn = createServerFn({ method: "GET" })
  .validator(PublicEditorialDocumentInputSchema)
  .handler(({ data }) => readRoute(data.slug, data.kind));
