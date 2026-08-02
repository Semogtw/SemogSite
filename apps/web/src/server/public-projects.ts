import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import {
  readPublicProjectBySlug,
  readPublicProjects,
} from "./public-projects.server";

export const getPublicProjectsFn = createServerFn({ method: "GET" }).handler(
  readPublicProjects,
);

export const getPublicProjectFn = createServerFn({ method: "GET" })
  .validator(z.object({ slug: z.string().trim().min(1).max(120) }))
  .handler(({ data }) => readPublicProjectBySlug(data.slug));
