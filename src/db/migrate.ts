import path from "node:path";
import { migrate as migratePglite } from "drizzle-orm/pglite/migrator";
import { migrate as migratePostgres } from "drizzle-orm/postgres-js/migrator";
import type { PgliteDatabase } from "drizzle-orm/pglite";
import { isPglite, type DB } from "./index";

const migrationsFolder = path.join(process.cwd(), "drizzle");

export async function runMigrations(database: DB) {
  if (isPglite()) {
    await migratePglite(database as unknown as PgliteDatabase, { migrationsFolder });
  } else {
    await migratePostgres(database, { migrationsFolder });
  }
}
