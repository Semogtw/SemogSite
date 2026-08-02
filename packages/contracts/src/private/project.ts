import { z } from "zod";
import {
  ConfidenceSchema,
  PrioritySchema,
  ProjectHealthSchema,
  VisibilitySchema,
} from "../common/enums";

export const PrivateProjectSchema = z.object({
  id: z.string().min(1),
  slug: z.string().min(1),
  name: z.string().min(1),
  status: z.enum(["planning", "active", "paused", "archived"]),
  health: ProjectHealthSchema,
  priority: PrioritySchema,
  progressEstimate: z.number().int().min(0).max(100),
  focus: z.string(),
  nextAction: z.string(),
  branchSummary: z.string().nullable(),
  statusBasis: z.string(),
  confidence: ConfidenceSchema,
  visibility: VisibilitySchema,
  publicSummary: z.string().nullable(),
  privateSummary: z.string().nullable(),
  repositoryFullNames: z.array(z.string()),
  lastActivityAt: z.string().datetime().nullable(),
  lastSyncedAt: z.string().datetime().nullable(),
  manualLock: z.boolean(),
});

export type PrivateProjectDto = z.infer<typeof PrivateProjectSchema>;
