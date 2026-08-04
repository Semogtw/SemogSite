import { z } from "zod";

const BoundedIdSchema = z.string().trim().min(1).max(200);
const BoundedProviderMetadataSchema = z.string().trim().min(1).max(120).nullable();

export const AssistanceOriginSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("manual") }).strict(),
  z
    .object({
      kind: z.literal("deterministic_rule"),
      ruleId: z.string().trim().min(1).max(120),
      ruleVersion: z.number().int().positive(),
    })
    .strict(),
  z
    .object({
      kind: z.literal("template"),
      templateId: z.string().trim().min(1).max(120),
      templateVersion: z.number().int().positive(),
    })
    .strict(),
  z
    .object({
      kind: z.literal("external_ai_client"),
      clientId: BoundedIdSchema,
      declaredProvider: BoundedProviderMetadataSchema,
      declaredModel: BoundedProviderMetadataSchema,
    })
    .strict(),
  z
    .object({
      kind: z.literal("internal_model_provider"),
      providerId: z.string().trim().min(1).max(120),
      modelId: z.string().trim().min(1).max(120),
    })
    .strict(),
]);

export type AssistanceOrigin = z.infer<typeof AssistanceOriginSchema>;

export const AssistanceAvailabilitySchema = z
  .object({
    deterministic: z.literal(true),
    externalAiConnected: z.boolean(),
    internalProviderConfigured: z.boolean(),
  })
  .strict();

export type AssistanceAvailability = z.infer<
  typeof AssistanceAvailabilitySchema
>;
