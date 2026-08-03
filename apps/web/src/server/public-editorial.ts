import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import {
  readPublicEditorial,
  readPublicEditorialBySlug,
  readPublicEditorialRoute,
} from "./public-editorial.server";

const PublicEditorialKindSchema = z.enum([
  "project",
  "note",
  "experiment",
  "page",
]);

const PublicEditorialDocumentInputSchema = z.object({
  slug: z.string().trim().min(1).max(120),
  kind: PublicEditorialKindSchema.nullable(),
});

export const getPublicEditorialFn = createServerFn({ method: "GET" })
  .validator(
    z.object({
      kind: PublicEditorialKindSchema.nullable(),
      limit: z.number().int().min(1).max(100),
    }),
  )
  .handler(({ data }) => readPublicEditorial(data));

export const getPublicEditorialDocumentFn = createServerFn({ method: "GET" })
  .validator(PublicEditorialDocumentInputSchema)
  .handler(({ data }) => readPublicEditorialBySlug(data.slug, data.kind));

export const getPublicEditorialDocumentRouteFn = createServerFn({ method: "GET" })
  .validator(PublicEditorialDocumentInputSchema)
  .handler(({ data }) => readPublicEditorialRoute(data.slug, data.kind));
