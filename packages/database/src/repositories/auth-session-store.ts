import type { AuthSessionRecord, AuthSessionStore } from "@semogtw/auth";
import { and, eq, gt, isNull } from "drizzle-orm";
import type { SqliteDatabase } from "../adapters/sqlite";
import { authSessions, ownerAccounts } from "../schema/auth";

export class SqliteAuthSessionStore implements AuthSessionStore {
  constructor(private readonly database: SqliteDatabase) {}

  upsertOwnerAccount(input: {
    id: string;
    displayName: string;
    passwordHash: string;
    now: Date;
  }): void {
    const timestamp = input.now.toISOString();
    this.database
      .insert(ownerAccounts)
      .values({
        id: input.id,
        displayName: input.displayName,
        passwordHash: input.passwordHash,
        active: true,
        createdAt: timestamp,
        updatedAt: timestamp,
      })
      .onConflictDoUpdate({
        target: ownerAccounts.id,
        set: {
          displayName: input.displayName,
          passwordHash: input.passwordHash,
          active: true,
          updatedAt: timestamp,
        },
      })
      .run();
  }

  async insert(record: AuthSessionRecord): Promise<void> {
    this.database.insert(authSessions).values(record).run();
  }

  async findActiveByTokenDigest(
    tokenDigest: string,
    now: Date,
  ): Promise<AuthSessionRecord | null> {
    return (
      this.database
        .select()
        .from(authSessions)
        .where(
          and(
            eq(authSessions.tokenDigest, tokenDigest),
            isNull(authSessions.revokedAt),
            gt(authSessions.expiresAt, now.toISOString()),
          ),
        )
        .get() ?? null
    );
  }

  async revoke(sessionId: string, revokedAt: Date): Promise<void> {
    this.database
      .update(authSessions)
      .set({ revokedAt: revokedAt.toISOString() })
      .where(eq(authSessions.id, sessionId))
      .run();
  }
}
