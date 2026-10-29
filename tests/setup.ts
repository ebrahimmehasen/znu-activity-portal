import { beforeAll } from "vitest";
import { db } from "@/db";
import { runMigrations } from "@/db/migrate";

// Each test file gets its own module graph, hence its own in-memory PGlite.
beforeAll(async () => {
  await runMigrations(db);
});
