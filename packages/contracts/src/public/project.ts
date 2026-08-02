import { z } from "zod";
import { VisibilitySchema } from "../common/enums";

export const PublicProjectSchema = z.object({
  slug: z.string().min(1),
  name: z.string().min(1),
  publicSummary: z.string().min(1),
  publicProgress: z.number().int().min(0).max(100).nullable(),
  featured: z.boolean(),
  liveUrl: z.string().url().nullable(),
  documentationUrl: z.string().url().nullable(),
  lastPublicActivityAt: z.string().datetime().nullable(),
});

export type PublicProjectDto = z.infer<typeof PublicProjectSchema>;

export type PublishableProjectSource = {
  slug: string;
  name: string;
  visibility: z.infer<typeof VisibilitySchema>;
  publicSummary: string | null;
  publicProgress: number | null;
  featured: boolean;
  liveUrl: string | null;
  documentationUrl: string | null;
  lastPublicActivityAt: string | null;
  privateSummary: string | null;
  branchSummary: string | null;
  repositoryFullNames: readonly string[];
  blockers: readonly string[];
  evidenceUrls: readonly string[];
  sessionDetails: readonly string[];
  auditEventIds: readonly string[];
};

export function toPublicProjectDto(
  source: PublishableProjectSource,
): PublicProjectDto {
  if (source.visibility === "private" || source.publicSummary === null) {
    throw new Error("PUBLICATION_NOT_ALLOWED");
  }

  return PublicProjectSchema.parse({
    slug: source.slug,
    name: source.name,
    publicSummary: source.publicSummary,
    publicProgress: source.publicProgress,
    featured: source.featured,
    liveUrl: source.liveUrl,
    documentationUrl: source.documentationUrl,
    lastPublicActivityAt: source.lastPublicActivityAt,
  });
}

export function isPubliclyListed(
  source: Pick<PublishableProjectSource, "visibility">,
): boolean {
  return source.visibility === "public";
}
