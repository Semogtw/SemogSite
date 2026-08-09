import type { AuthSessionRecord, AuthSessionStore } from "@semogtw/auth";
import type {
  D1DatabaseBinding,
  D1PreparedStatementBinding,
  D1QueryResult,
} from "../adapters/d1";

type AuthSessionRow = {
  readonly id: string;
  readonly ownerId: string;
  readonly tokenDigest: string;
  readonly createdAt: string;
  readonly expiresAt: string;
  readonly revokedAt: string | null;
};

function assertSuccessful(
  result: D1QueryResult | undefined,
  operation: string,
): void {
  if (result?.success === false) {
    throw new Error(`D1_AUTH_${operation}_FAILED`);
  }
}

function bind(
  database: D1DatabaseBinding,
  sql: string,
  values: readonly unknown[],
): D1PreparedStatementBinding {
  return database.prepare(sql).bind(...values);
}

function toAuthSessionRecord(row: AuthSessionRow): AuthSessionRecord {
  return {
    id: row.id,
    ownerId: row.ownerId,
    tokenDigest: row.tokenDigest,
    createdAt: row.createdAt,
    expiresAt: row.expiresAt,
    revokedAt: row.revokedAt,
  };
}

/**
 * D1 implementation of the runtime-neutral auth session contract.
 *
 * Owner bootstrap and password-rotation revocation share one D1 batch so the
 * old password hash is inspected before the upsert changes it. D1 batches are
 * transactional, preserving the SQLite behavior without importing Node code.
 */
export class D1AuthSessionStore implements AuthSessionStore {
  constructor(private readonly database: D1DatabaseBinding) {}

  async upsertOwnerAccount(input: {
    id: string;
    displayName: string;
    passwordHash: string;
    now: Date;
  }): Promise<void> {
    const timestamp = input.now.toISOString();
    const revokeChangedPasswordSessions = bind(
      this.database,
      `UPDATE auth_sessions
       SET revoked_at = ?
       WHERE owner_id = ?
         AND revoked_at IS NULL
         AND EXISTS (
           SELECT 1
           FROM owner_accounts
           WHERE id = ? AND password_hash <> ?
         )`,
      [timestamp, input.id, input.id, input.passwordHash],
    );
    const upsertOwner = bind(
      this.database,
      `INSERT INTO owner_accounts (
         id,
         display_name,
         password_hash,
         active,
         created_at,
         updated_at
       ) VALUES (?, ?, ?, 1, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         display_name = excluded.display_name,
         password_hash = excluded.password_hash,
         active = 1,
         updated_at = excluded.updated_at`,
      [
        input.id,
        input.displayName,
        input.passwordHash,
        timestamp,
        timestamp,
      ],
    );

    const results = await this.database.batch([
      revokeChangedPasswordSessions,
      upsertOwner,
    ]);
    assertSuccessful(results[0], "OWNER_SESSION_REVOCATION");
    assertSuccessful(results[1], "OWNER_UPSERT");
  }

  async insert(record: AuthSessionRecord): Promise<void> {
    const result = await bind(
      this.database,
      `INSERT INTO auth_sessions (
         id,
         owner_id,
         token_digest,
         created_at,
         expires_at,
         revoked_at
       ) VALUES (?, ?, ?, ?, ?, ?)`,
      [
        record.id,
        record.ownerId,
        record.tokenDigest,
        record.createdAt,
        record.expiresAt,
        record.revokedAt,
      ],
    ).run();
    assertSuccessful(result, "SESSION_INSERT");
  }

  async findActiveByTokenDigest(
    tokenDigest: string,
    now: Date,
  ): Promise<AuthSessionRecord | null> {
    const row = (await bind(
      this.database,
      `SELECT
         id,
         owner_id AS ownerId,
         token_digest AS tokenDigest,
         created_at AS createdAt,
         expires_at AS expiresAt,
         revoked_at AS revokedAt
       FROM auth_sessions
       WHERE token_digest = ?
         AND revoked_at IS NULL
         AND expires_at > ?
       LIMIT 1`,
      [tokenDigest, now.toISOString()],
    ).first<AuthSessionRow>()) as AuthSessionRow | null;

    return row === null ? null : toAuthSessionRecord(row);
  }

  async revoke(sessionId: string, revokedAt: Date): Promise<void> {
    const result = await bind(
      this.database,
      `UPDATE auth_sessions
       SET revoked_at = ?
       WHERE id = ?`,
      [revokedAt.toISOString(), sessionId],
    ).run();
    assertSuccessful(result, "SESSION_REVOCATION");
  }
}
