import { sql } from "drizzle-orm";
import { db } from "@/db";
import { users, type UserRole } from "@/db/schema";
import { cairoToday } from "@/lib/dates";
import { hashPassword } from "@/lib/password";
import type { TripInput } from "@/lib/trips/service";

export async function resetDb() {
  await db.execute(
    sql`truncate table audit_logs, sessions, rate_limits, buses, activity_schedule_items, activities, settings, faculties, users restart identity cascade`,
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

export function daysFromToday(n: number) {
  const d = new Date(`${cairoToday()}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export function tripInput(overrides: Partial<TripInput> = {}): TripInput {
  return {
    title: "رحلة الإسكندرية",
    description: "يوم على البحر",
    date: daysFromToday(10),
    startTime: "06:30",
    endTime: "22:00",
    location: "الإسكندرية",
    capacity: 50,
    whenFull: "close",
    waitlistPromotion: "auto",
    feeEnabled: false,
    feeAmount: "",
    paymentRequired: false,
    lateGraceMinutes: 10,
    busesEnabled: false,
    supervisorScope: "bus",
    schedule: [
      { time: "06:30", title: "التجمع والتحرك", notes: "" },
      { time: "", title: "الغداء", notes: "على الشاطئ" },
    ],
    ...overrides,
  };
}
