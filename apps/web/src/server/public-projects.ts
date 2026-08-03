import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import {
  readPublicProject,
  readPublicProjectRoute,
  readPublicProjects,
} from "./public-projects.server";

const PublicProjectInputSchema = z.object({
  slug: z.string().trim().min(1).max(120),
});

export const getPublicProjectsFn = createServerFn({ method: "GET" }).handler(
  readPublicProjects,
);

export const getPublicProjectFn = createServerFn({ method: "GET" })
  .validator(PublicProjectInputSchema)
  .handler(({ data }) => readPublicProject(data.slug));

export const getPublicProjectRouteFn = createServerFn({ method: "GET" })
  .validator(PublicProjectInputSchema)
  .handler(({ data }) => readPublicProjectRoute(data.slug));
