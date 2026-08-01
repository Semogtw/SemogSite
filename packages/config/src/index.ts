import { z } from "zod";

const DatabaseConfigSchema = z.object({
  SEMOGTW_DATABASE_URL: z.string().min(1).default("./data/semogtw.sqlite"),
});

const RuntimeConfigSchema = DatabaseConfigSchema.extend({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  SEMOGTW_SESSION_SECRET: z
    .string()
    .min(32, "SEMOGTW_SESSION_SECRET must contain at least 32 characters"),
  SEMOGTW_OWNER_PASSWORD_HASH: z
    .string()
    .min(1, "SEMOGTW_OWNER_PASSWORD_HASH is required"),
});

export type DatabaseConfig = {
  databaseUrl: string;
};

export type RuntimeConfig = DatabaseConfig & {
  nodeEnv: "development" | "test" | "production";
  sessionSecret: string;
  ownerPasswordHash: string;
};

export function parseDatabaseConfig(
  env: Record<string, string | undefined>,
): DatabaseConfig {
  const parsed = DatabaseConfigSchema.parse(env);
  return { databaseUrl: parsed.SEMOGTW_DATABASE_URL };
}

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
