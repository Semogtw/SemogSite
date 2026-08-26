import type { PublicEditorialDocument } from "@semogtw/contracts";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import {
  readPublicEditorialBySlugFromApi,
  readPublicEditorialFromApi,
  readPublicEditorialRouteFromApi,
  type PublicEditorialRouteResolution,
  type PublicEditorialSummary,
} from "./public-editorial-api.server";

const PublicProjectInputSchema = z.object({
  slug: z.string().trim().min(1).max(120),
});

type PublicProjectSummary = Omit<PublicEditorialSummary, "kind">;

function toProjectSummary(summary: PublicEditorialSummary): PublicProjectSummary {
  return {
    slug: summary.slug,
    title: summary.title,
    excerpt: summary.excerpt,
    tags: summary.tags,
    updatedAt: summary.updatedAt,
  };
}

async function readPublicProjects(): Promise<readonly PublicProjectSummary[]> {
  return (await readPublicEditorialFromApi({ kind: "project", limit: 100 })).map(
    toProjectSummary,
  );
}

async function readPublicProject(
  slug: string,
): Promise<PublicEditorialDocument | null> {
  return readPublicEditorialBySlugFromApi(slug, "project");
}

async function readPublicProjectRoute(
  slug: string,
): Promise<PublicEditorialRouteResolution> {
  return readPublicEditorialRouteFromApi(slug, "project");
}

export const getPublicProjectsFn = createServerFn({ method: "GET" }).handler(
  readPublicProjects,
);

export const getPublicProjectFn = createServerFn({ method: "GET" })
  .validator(PublicProjectInputSchema)
  .handler(({ data }) => readPublicProject(data.slug));

export const getPublicProjectRouteFn = createServerFn({ method: "GET" })
  .validator(PublicProjectInputSchema)
  .handler(({ data }) => readPublicProjectRoute(data.slug));
