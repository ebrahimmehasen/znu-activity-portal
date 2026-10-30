import { and, asc, count, eq, ilike, inArray, ne, or, sql } from "drizzle-orm";
import { db } from "@/db";
import { activities, bookings, faculties, students } from "@/db/schema";
import { recordAudit, type RequestCtx } from "@/lib/audit";
import type { SessionUser } from "@/lib/auth/service";
import { can } from "@/lib/authz";
import { ForbiddenError } from "@/lib/errors";
import { toLatinDigits } from "@/lib/students/validation";

/**
 * Manual data deletion (plan §8): data stays after a trip ends until an admin wipes a
 * finished trip or a student. Both need a typed confirmation on top of the confirm
 * dialog, and are audited without the personal data itself.
 */

type Result = { ok: true } | { ok: false; error: string };

/** What the admin types to confirm wiping a student. */
export const STUDENT_PURGE_WORD = "مسح";

function assertAdmin(actor: SessionUser) {
  if (!can(actor, "manage_activities")) throw new ForbiddenError();
}

/** A finished trip with all its bookings, attendance, gatherings, buses and announcements. */
export async function purgeTrip(actor: SessionUser, id: number, typedTitle: string, ctx: RequestCtx): Promise<Result> {
  assertAdmin(actor);
  const [trip] = await db.select().from(activities).where(eq(activities.id, id));
  if (!trip) return { ok: false, error: "الرحلة مش موجودة" };
  if (trip.status !== "finished") return { ok: false, error: "المسح للرحلات المنتهية بس" };
  if (typedTitle.trim() !== trip.title.trim()) return { ok: false, error: "اكتب اسم الرحلة زي ما هو بالظبط عشان تأكد المسح" };

  const [{ n }] = await db.select({ n: count() }).from(bookings).where(eq(bookings.activityId, id));
  await db.delete(activities).where(eq(activities.id, id));
  await recordAudit(
    { actor: { type: "user", id: actor.id }, action: "activity.purged", subjectType: "activity", subjectId: id, meta: { title: trip.title, date: trip.date, bookings: n } },
    ctx,
  );
  return { ok: true };
}

const SEARCH_LIMIT = 30;

/** By name, phone or national ID; at least 3 characters. */
export async function searchStudents(actor: SessionUser, raw: string) {
  assertAdmin(actor);
  const q = toLatinDigits(raw.trim());
  if (q.length < 3) return [];
  const like = `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
  return db
    .select({
      id: students.id,
      name: students.name,
      phone: students.phone,
      nationalId: students.nationalId,
      year: students.year,
      facultyName: faculties.name,
      bookings: sql<number>`(select count(*) from ${bookings} where ${bookings.studentId} = ${students.id})`.mapWith(Number),
    })
    .from(students)
    .innerJoin(faculties, eq(faculties.id, students.facultyId))
    .where(or(ilike(students.name, like), ilike(students.phone, like), ilike(students.nationalId, like)))
    .orderBy(asc(students.name))
    .limit(SEARCH_LIMIT);
}

/**
 * A student with all their bookings (and through them attendance) and sessions.
 * Refused while they hold a live booking on a trip that hasn't finished: cancel it first.
 */
export async function purgeStudent(actor: SessionUser, id: number, typed: string, ctx: RequestCtx): Promise<Result> {
  assertAdmin(actor);
  if (typed.trim() !== STUDENT_PURGE_WORD) return { ok: false, error: `اكتب "${STUDENT_PURGE_WORD}" عشان تأكد المسح` };
  const [student] = await db.select({ id: students.id }).from(students).where(eq(students.id, id));
  if (!student) return { ok: false, error: "الطالب مش موجود" };

  const [{ live }] = await db
    .select({ live: count() })
    .from(bookings)
    .innerJoin(activities, eq(activities.id, bookings.activityId))
    .where(and(eq(bookings.studentId, id), ne(activities.status, "finished"), inArray(bookings.status, ["pending", "confirmed", "waitlisted"])));
  if (live > 0) return { ok: false, error: "الطالب عنده حجز في رحلة لسه مخلصتش. الغي الحجز الأول" };

  const removed = await db.transaction(async (tx) => {
    const gone = await tx.delete(bookings).where(eq(bookings.studentId, id)).returning({ id: bookings.id });
    await tx.delete(students).where(eq(students.id, id));
    return gone.length;
  });
  await recordAudit({ actor: { type: "user", id: actor.id }, action: "student.purged", subjectType: "student", subjectId: id, meta: { bookings: removed } }, ctx);
  return { ok: true };
}
