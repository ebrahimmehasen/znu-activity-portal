import { PGlite } from "@electric-sql/pglite";
import { drizzle as drizzlePglite } from "drizzle-orm/pglite";
import { drizzle as drizzlePostgres, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

export type DB = PostgresJsDatabase<typeof schema>;

/**
 * DATABASE_URL picks the driver:
 * - postgres://…  → Supabase / any Postgres (production)
 * - memory://     → in-memory PGlite (tests)
 * - empty         → PGlite persisted in ./.pglite (local development)
 */
export function createDb(url = process.env.DATABASE_URL ?? ""): DB {
  if (url.startsWith("postgres://") || url.startsWith("postgresql://")) {
    // prepare: false is required by Supabase's transaction pooler.
    const client = postgres(url, { prepare: false, max: 10 });
    return drizzlePostgres(client, { schema });
  }
  const client = url === "memory://" ? new PGlite() : new PGlite("./.pglite");
  // Both drivers expose the same query-builder API; PgDatabase typing differs only in result HKTs.
  return drizzlePglite(client, { schema }) as unknown as DB;
}

export function isPglite(url = process.env.DATABASE_URL ?? "") {
  return !(url.startsWith("postgres://") || url.startsWith("postgresql://"));
}

const globalForDb = globalThis as unknown as { __znuDb?: DB };

export const db: DB = globalForDb.__znuDb ?? createDb();
if (process.env.NODE_ENV !== "production") globalForDb.__znuDb = db;
