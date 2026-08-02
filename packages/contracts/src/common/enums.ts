import { z } from "zod";

export const VisibilitySchema = z.enum(["private", "unlisted", "public"]);
export const ConfidenceSchema = z.enum(["high", "medium", "low"]);
export const PrioritySchema = z.enum(["critical", "high", "medium", "low"]);
export const ProjectHealthSchema = z.enum([
  "healthy",
  "attention",
  "blocked",
  "unknown",
]);
