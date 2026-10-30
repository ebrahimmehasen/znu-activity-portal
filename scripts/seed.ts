import "dotenv/config";
import { db } from "../src/db";
import { seed } from "../src/db/seed";

async function main() {
  const password = process.env.SEED_SUPER_ADMIN_PASSWORD;

  const result = await seed(db, {
    superAdmin: password
      ? {
          username: process.env.SEED_SUPER_ADMIN_USERNAME || "superadmin",
          password,
          name: process.env.SEED_SUPER_ADMIN_NAME || "السوبر أدمن",
        }
      : undefined,
  });

  console.log("✓ faculties and default settings seeded");
  if (result.superAdminCreated) console.log("✓ super admin created");
  else if (!password) console.log("• SEED_SUPER_ADMIN_PASSWORD not set — super admin skipped (or already exists)");
  else console.log("• super admin already exists — skipped");
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
