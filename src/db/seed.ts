import { eq } from "drizzle-orm";
import { DEFAULT_SETTINGS, SETTING_KEYS } from "@/lib/settings-definitions";
import { hashPassword, passwordSchema } from "@/lib/password";
import type { DB } from "./index";
import { auditLogs, faculties, settings, users } from "./schema";

export const FACULTIES = [
  "الطب البشري",
  "طب الأسنان",
  "الصيدلة",
  "الهندسة",
  "الحاسبات وتكنولوجيا المعلومات",
  "التمريض",
  "التجارة / إدارة الأعمال",
];

type SeedOptions = { superAdmin?: { username: string; password: string; name: string } };

/** Idempotent: safe to run on every deploy. Never overwrites edited faculties or settings. */
export async function seed(db: DB, opts: SeedOptions = {}) {
  await db
    .insert(faculties)
    .values(FACULTIES.map((name, i) => ({ name, sortOrder: i + 1 })))
    .onConflictDoNothing();

  await db
    .insert(settings)
    .values(SETTING_KEYS.map((key) => ({ key, value: DEFAULT_SETTINGS[key] })))
    .onConflictDoNothing();

  const existing = await db.select({ id: users.id }).from(users).where(eq(users.role, "super_admin")).limit(1);
  if (existing.length > 0 || !opts.superAdmin) return { superAdminCreated: false };

  const { username, password, name } = opts.superAdmin;
  passwordSchema.parse(password);
  const [created] = await db
    .insert(users)
    .values({ name, username, passwordHash: await hashPassword(password), role: "super_admin" })
    .returning({ id: users.id });
  await db.insert(auditLogs).values({
    actorType: "system",
    action: "user.super_admin_seeded",
    subjectType: "user",
    subjectId: String(created.id),
    meta: { username },
  });
  return { superAdminCreated: true };
}
