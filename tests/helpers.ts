import { sql } from "drizzle-orm";
import { db } from "@/db";
import { users, type UserRole } from "@/db/schema";
import { hashPassword } from "@/lib/password";

export async function resetDb() {
  await db.execute(
    sql`truncate table audit_logs, sessions, rate_limits, activities, settings, faculties, users restart identity cascade`,
  );
}

export async function createUser(
  role: UserRole,
  overrides: Partial<{ username: string; password: string; name: string; isActive: boolean }> = {},
) {
  const username = overrides.username ?? `${role}_${Math.random().toString(36).slice(2, 8)}`;
  const [user] = await db
    .insert(users)
    .values({
      name: overrides.name ?? username,
      username,
      passwordHash: await hashPassword(overrides.password ?? "password123"),
      role,
      isActive: overrides.isActive ?? true,
    })
    .returning();
  return user;
}

export const ctx = { ip: "127.0.0.1", userAgent: "vitest" };
