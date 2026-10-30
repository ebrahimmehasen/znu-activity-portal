import "dotenv/config";
import { db } from "../src/db";
import { runMigrations } from "../src/db/migrate";

async function main() {
  await runMigrations(db);
  console.log("✓ migrations applied");
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
