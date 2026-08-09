import type { PublishableProjectSource } from "@semogtw/contracts";
import { projects } from "../schema/projects";

type ProjectRow = typeof projects.$inferSelect;

export function toPublishableProjectSource(
  row: ProjectRow,
): PublishableProjectSource {
  return {
    slug: row.slug,
    name: row.name,
    visibility: row.visibility,
    publicSummary: row.publicSummary,
    publicProgress: row.publicProgress,
    featured: row.featured,
    liveUrl: row.liveUrl,
    documentationUrl: row.documentationUrl,
    lastPublicActivityAt: null,
    privateSummary: row.privateSummary,
    branchSummary: row.branchSummary,
    repositoryFullNames: [],
    blockers: [],
    evidenceUrls: [],
    sessionDetails: [],
    auditEventIds: [],
  };
}
