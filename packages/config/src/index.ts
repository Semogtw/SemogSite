import { z } from "zod";

const RuntimeConfigSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  SEMOGTW_SESSION_SECRET: z.string().min(32, "SEMOGTW_SESSION_SECRET must contain at least 32 characters"),
  SEMOGTW_OWNER_PASSWORD_HASH: z.string().min(1, "SEMOGTW_OWNER_PASSWORD_HASH is required"),
  SEMOGTW_DATABASE_URL: z.string().min(1).default("./data/semogtw.sqlite"),
});

export type RuntimeConfig = {
  nodeEnv: "development" | "test" | "production";
  sessionSecret: string;
  ownerPasswordHash: string;
  databaseUrl: string;
};

export function parseRuntimeConfig(
  env: Record<string, string | undefined>,
): RuntimeConfig {
  const parsed = RuntimeConfigSchema.parse(env);
  return {
    nodeEnv: parsed.NODE_ENV,
    sessionSecret: parsed.SEMOGTW_SESSION_SECRET,
    ownerPasswordHash: parsed.SEMOGTW_OWNER_PASSWORD_HASH,
    databaseUrl: parsed.SEMOGTW_DATABASE_URL,
  };
}
