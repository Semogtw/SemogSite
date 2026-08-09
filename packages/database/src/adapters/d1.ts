import {
  drizzle,
  type DrizzleD1Database,
} from "drizzle-orm/d1";
import * as schema from "../schema";

export type D1QueryResult<Row = Record<string, unknown>> = {
  readonly results: readonly Row[];
  readonly success?: boolean;
  readonly error?: string;
  readonly meta?: Readonly<Record<string, unknown>>;
};

export interface D1PreparedStatementBinding {
  bind(...values: readonly unknown[]): D1PreparedStatementBinding;
  all<Row = Record<string, unknown>>(): Promise<D1QueryResult<Row>>;
  first<Row = Record<string, unknown>>(): Promise<Row | null>;
  raw<Row extends readonly unknown[] = readonly unknown[]>(options?: {
    columnNames?: boolean;
  }): Promise<readonly Row[]>;
  run(): Promise<D1QueryResult>;
}

export interface D1DatabaseBinding {
  prepare(query: string): D1PreparedStatementBinding;
  batch(
    statements: readonly D1PreparedStatementBinding[],
  ): Promise<readonly D1QueryResult[]>;
  exec?(query: string): Promise<Readonly<Record<string, unknown>>>;
}

export type SemogtwD1Database = DrizzleD1Database<typeof schema> & {
  $client: D1DatabaseBinding;
};

/**
 * Composes Drizzle over the Worker-provided D1 binding without importing
 * Cloudflare runtime globals into domain or repository contracts.
 */
export function createD1Database(
  binding: D1DatabaseBinding,
): SemogtwD1Database {
  return drizzle(binding as never, { schema }) as SemogtwD1Database;
}
