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
    // Use Supabase's *session* pooler (port 5432): postgres.js pipelines concurrent queries
    // on a connection, and the transaction pooler (6543) hangs on pipelined queries.
    // On Vercel each function instance keeps one connection and drops it when idle, so
    // many instances don't exhaust the pooler.
    if (/:6543\//.test(url)) console.warn("DATABASE_URL uses Supabase's transaction pooler (6543); use the session pooler (5432)");
    const client = postgres(url, { prepare: false, max: process.env.VERCEL ? 1 : 10, idle_timeout: process.env.VERCEL ? 20 : undefined });
    return drizzlePostgres(client, { schema });
  }
  // Vercel's filesystem is read-only and per-instance: a PGlite fallback there would lose data.
  if (process.env.VERCEL) throw new Error("DATABASE_URL must be a postgres:// URL on Vercel");
  const client = url === "memory://" ? new PGlite() : new PGlite("./.pglite");
  // Both drivers expose the same query-builder API; PgDatabase typing differs only in result HKTs.
  return drizzlePglite(client, { schema }) as unknown as DB;
}

export function isPglite(url = process.env.DATABASE_URL ?? "") {
  return !(url.startsWith("postgres://") || url.startsWith("postgresql://"));
}

const globalForDb = globalThis as unknown as { __znuDb?: DB };

function getDb(): DB {
  globalForDb.__znuDb ??= createDb();
  return globalForDb.__znuDb;
}

/**
 * Connects on first use, not at import: `next build` imports server modules in
 * parallel workers, and a file-based PGlite opened by several processes gets
 * locked or corrupted.
 */
export const db: DB = new Proxy({} as DB, {
  get(_target, prop) {
    const real = getDb();
    const value = Reflect.get(real, prop, real);
    return typeof value === "function" ? value.bind(real) : value;
  },
});
