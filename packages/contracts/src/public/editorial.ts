import { z } from "zod";

const slugPattern = /^[a-z0-9](?:[a-z0-9-]{0,118}[a-z0-9])?$/u;
const tagPattern = /^[a-z0-9](?:[a-z0-9-]{0,38}[a-z0-9])?$/u;
const sha256Pattern = /^[a-f0-9]{64}$/u;
const rawHtmlPattern = /<\/?[a-z][^>]*>/iu;

export const PublicEditorialDocumentSchema = z
  .object({
    kind: z.enum(["project", "note", "experiment", "page"]),
    slug: z.string().regex(slugPattern),
    title: z.string().trim().min(1).max(160),
    excerpt: z.string().trim().min(1).max(320),
    bodyMarkdown: z
      .string()
      .trim()
      .min(1)
      .max(100_000)
      .refine((value) => !rawHtmlPattern.test(value), {
        message: "RAW_HTML_FORBIDDEN",
      }),
    tags: z.array(z.string().regex(tagPattern)).max(12),
    contentHash: z.string().regex(sha256Pattern),
    publishedRevisionId: z.string().trim().min(1).max(200),
    updatedAt: z.string().datetime({ offset: true }),
  })
  .strict();

export const PublicEditorialListSchema = z
  .object({
    items: z.array(PublicEditorialDocumentSchema).max(100),
  })
  .strict();

export type PublicEditorialDocument = z.infer<
  typeof PublicEditorialDocumentSchema
>;
export type PublicEditorialList = z.infer<typeof PublicEditorialListSchema>;
