import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export const ownerAccounts = sqliteTable("owner_accounts", {
  id: text("id").primaryKey(),
  displayName: text("display_name").notNull(),
  passwordHash: text("password_hash").notNull(),
  active: integer("active", { mode: "boolean" }).notNull(),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const authSessions = sqliteTable(
  "auth_sessions",
  {
    id: text("id").primaryKey(),
    ownerId: text("owner_id")
      .notNull()
      .references(() => ownerAccounts.id, { onDelete: "cascade" }),
    tokenDigest: text("token_digest").notNull(),
    createdAt: text("created_at").notNull(),
    expiresAt: text("expires_at").notNull(),
    revokedAt: text("revoked_at"),
  },
  (table) => [
    uniqueIndex("auth_sessions_token_digest_unique").on(table.tokenDigest),
    index("idx_auth_sessions_digest").on(
      table.tokenDigest,
      table.expiresAt,
      table.revokedAt,
    ),
  ],
);
