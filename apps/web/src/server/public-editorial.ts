import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import {
  readPublicEditorial,
  readPublicEditorialBySlug,
} from "./public-editorial.server";

const PublicEditorialKindSchema = z.enum([
  "project",
  "note",
  "experiment",
  "page",
]);

export const getPublicEditorialFn = createServerFn({ method: "GET" })
  .validator(
    z.object({
      kind: PublicEditorialKindSchema.nullable(),
      limit: z.number().int().min(1).max(100),
    }),
  )
  .handler(({ data }) => readPublicEditorial(data));

export const getPublicEditorialDocumentFn = createServerFn({ method: "GET" })
  .validator(
    z.object({
      slug: z.string().trim().min(1).max(120),
      kind: PublicEditorialKindSchema.nullable(),
    }),
  )
  .handler(({ data }) => readPublicEditorialBySlug(data.slug, data.kind));
