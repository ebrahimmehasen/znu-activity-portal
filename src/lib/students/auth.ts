import { randomBytes } from "node:crypto";
import { and, asc, desc, eq, gt, lt, sql } from "drizzle-orm";
import { db } from "@/db";
import { activities, bookings, buses, studentSessions, students } from "@/db/schema";
import { recordAudit, type RequestCtx } from "@/lib/audit";
import { hashToken } from "@/lib/auth/service";
import { ensureBookingSecret } from "@/lib/qr/secrets";
import { clearFailures, lockedFor, registerFailure } from "@/lib/rate-limit";
import { getSetting } from "@/lib/settings/service";
import { isValidNationalId, toLatinDigits } from "./validation";

export const STUDENT_SESSION_TTL_SECONDS = 30 * 24 * 60 * 60;

export const STUDENT_LOGIN_LIMITS = {
  // Plan §7: 5 wrong attempts lock the phone number for 15 minutes.
  phone: { limit: 5, windowSeconds: 15 * 60, lockSeconds: 15 * 60 },
  // A campus network shares one IP, so this only stops bulk guessing.
  ip: { limit: 50, windowSeconds: 15 * 60, lockSeconds: 15 * 60 },
};

export type StudentSession = { id: number; name: string };

type LoginResult =
  | { ok: true; student: StudentSession }
  | { ok: false; reason: "invalid" | "not_confirmed" }
  | { ok: false; reason: "locked"; retryAfterSeconds: number };

export async function authenticateStudent(phoneInput: string, nationalIdInput: string, ctx: RequestCtx): Promise<LoginResult> {
  const phone = toLatinDigits(phoneInput.trim()).replace(/\s+/g, "");
  const nationalId = toLatinDigits(nationalIdInput.trim()).replace(/\s+/g, "");
  const { phone: pl, ip: il } = STUDENT_LOGIN_LIMITS;
  const keys = [
    { key: `student-login:phone:${phone.slice(0, 20)}`, ...pl },
    { key: `student-login:ip:${ctx.ip ?? "unknown"}`, ...il },
  ];
  for (const k of keys) {
    const wait = await lockedFor(k.key, k.limit);
    if (wait > 0) return { ok: false, reason: "locked", retryAfterSeconds: wait };
  }

  const [student] =
    /^01[0125]\d{8}$/.test(phone) && isValidNationalId(nationalId)
      ? await db
          .select({ id: students.id, name: students.name })
          .from(students)
          .where(and(eq(students.nationalId, nationalId), eq(students.phone, phone)))
      : [];
  const statuses = student
    ? (await db.select({ status: bookings.status }).from(bookings).where(eq(bookings.studentId, student.id))).map((b) => b.status)
    : [];

  if (!student || statuses.length === 0) {
    let locked = false;
    for (const k of keys) locked = (await registerFailure(k.key, k.limit, k.windowSeconds, k.lockSeconds)).locked || locked;
    await recordAudit({ actor: null, action: "student.login_failed", meta: { phone: phone.slice(0, 20), locked } }, ctx);
    if (locked) return { ok: false, reason: "locked", retryAfterSeconds: pl.lockSeconds };
    return { ok: false, reason: "invalid" };
  }

  if (!statuses.includes("confirmed") && (await getSetting("student_login_non_confirmed")) === "denied") {
    return { ok: false, reason: "not_confirmed" };
  }

  await clearFailures(keys[0].key);
  await recordAudit({ actor: { type: "student", id: student.id }, action: "student.login", subjectType: "student", subjectId: student.id }, ctx);
  return { ok: true, student };
}

export async function createStudentSession(studentId: number, ctx: RequestCtx) {
  const token = randomBytes(32).toString("base64url");
  await db.delete(studentSessions).where(and(eq(studentSessions.studentId, studentId), lt(studentSessions.expiresAt, sql`now()`)));
  await db.insert(studentSessions).values({
    id: hashToken(token),
    studentId,
    expiresAt: new Date(Date.now() + STUDENT_SESSION_TTL_SECONDS * 1000),
    ip: ctx.ip,
    userAgent: ctx.userAgent?.slice(0, 500) ?? null,
  });
  return token;
}

export async function getStudentSession(token: string): Promise<StudentSession | null> {
  const [row] = await db
    .select({ id: students.id, name: students.name })
    .from(studentSessions)
    .innerJoin(students, eq(students.id, studentSessions.studentId))
    .where(and(eq(studentSessions.id, hashToken(token)), gt(studentSessions.expiresAt, sql`now()`)));
  return row ?? null;
}

export async function deleteStudentSession(token: string) {
  await db.delete(studentSessions).where(eq(studentSessions.id, hashToken(token)));
}

// ─── Portal queries ──────────────────────────────────────────────────────────

export async function listStudentTrips(studentId: number) {
  return db
    .select({
      bookingId: bookings.id,
      bookingStatus: bookings.status,
      waitlistPosition: bookings.waitlistPosition,
      trip: {
        id: activities.id,
        title: activities.title,
        date: activities.date,
        startTime: activities.startTime,
        location: activities.location,
        status: activities.status,
      },
    })
    .from(bookings)
    .innerJoin(activities, eq(activities.id, bookings.activityId))
    .where(eq(bookings.studentId, studentId))
    .orderBy(desc(activities.date), asc(activities.startTime));
}

/** One of the student's own trips; other trips answer null. */
export async function getStudentTrip(studentId: number, activityId: number) {
  const [row] = await db
    .select({ booking: bookings, trip: activities, busName: buses.name })
    .from(bookings)
    .innerJoin(activities, eq(activities.id, bookings.activityId))
    .leftJoin(buses, eq(buses.id, bookings.busId))
    .where(and(eq(bookings.studentId, studentId), eq(bookings.activityId, activityId)));
  return row ?? null;
}

export type OfflineQr = {
  bookingId: number;
  activityId: number;
  title: string;
  date: string;
  startTime: string | null;
  tripStatus: "upcoming" | "ongoing";
  busName: string | null;
  secret: string;
};

/**
 * What the phone keeps for offline QR: confirmed bookings of trips that haven't
 * finished. Cancelled bookings drop out here, so the next sync removes them.
 */
export async function offlineQrData(studentId: number): Promise<OfflineQr[]> {
  const rows = await db
    .select({ booking: bookings, trip: activities, busName: buses.name })
    .from(bookings)
    .innerJoin(activities, eq(activities.id, bookings.activityId))
    .leftJoin(buses, eq(buses.id, bookings.busId))
    .where(and(eq(bookings.studentId, studentId), eq(bookings.status, "confirmed")))
    .orderBy(asc(activities.date));

  const result: OfflineQr[] = [];
  for (const { booking, trip, busName } of rows) {
    if (trip.status === "finished") continue;
    const secret = await ensureBookingSecret(booking.id, booking.qrSecret);
    if (!secret) continue;
    result.push({
      bookingId: booking.id,
      activityId: trip.id,
      title: trip.title,
      date: trip.date,
      startTime: trip.startTime,
      tripStatus: trip.status,
      busName: trip.busesEnabled ? busName : null,
      secret,
    });
  }
  return result;
}
