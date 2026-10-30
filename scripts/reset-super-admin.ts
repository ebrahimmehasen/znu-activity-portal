import "dotenv/config";
import { asc, eq } from "drizzle-orm";
import { db } from "../src/db";
import { auditLogs, sessions, users } from "../src/db/schema";
import { hashPassword, passwordSchema } from "../src/lib/password";

/**
 * Sets the super admin's username and password from SEED_SUPER_ADMIN_USERNAME /
 * SEED_SUPER_ADMIN_PASSWORD (the seed only creates one when none exists), and signs
 * out its sessions. For a forgotten password or handing the system over.
 */
async function main() {
  const username = (process.env.SEED_SUPER_ADMIN_USERNAME ?? "").trim();
  const password = process.env.SEED_SUPER_ADMIN_PASSWORD ?? "";
  if (!/^[a-zA-Z0-9._-]{3,50}$/.test(username)) throw new Error("SEED_SUPER_ADMIN_USERNAME: 3-50 English letters, digits, . _ -");
  passwordSchema.parse(password);

  const [admin] = await db.select().from(users).where(eq(users.role, "super_admin")).orderBy(asc(users.id)).limit(1);
  if (!admin) throw new Error("No super admin yet — run npm run db:seed");
  const [taken] = await db.select({ id: users.id }).from(users).where(eq(users.username, username));
  if (taken && taken.id !== admin.id) throw new Error(`Username "${username}" belongs to another user`);

  await db.transaction(async (tx) => {
    await tx.update(users).set({ username, passwordHash: await hashPassword(password), updatedAt: new Date() }).where(eq(users.id, admin.id));
    await tx.delete(sessions).where(eq(sessions.userId, admin.id));
    await tx.insert(auditLogs).values({
      actorType: "system",
      action: "user.super_admin_reset",
      subjectType: "user",
      subjectId: String(admin.id),
      meta: { previousUsername: admin.username, username },
    });
  });
  console.log(`✓ super admin is now "${username}" (old sessions signed out)`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
