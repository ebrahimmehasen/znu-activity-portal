import { and, asc, count, eq, exists, inArray, isNotNull, isNull, max, sql, type SQL } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import {
  activities,
  activitySupervisors,
  attendances,
  bookings,
  buses,
  checkpoints,
  faculties,
  students,
  supervisorAttendances,
  users,
  type Activity,
  type Attendance,
  type AttendanceStatus,
  type Checkpoint,
} from "@/db/schema";
import { recordAudit, type RequestCtx } from "@/lib/audit";
import type { SessionUser } from "@/lib/auth/service";
import { can, type Ability } from "@/lib/authz";
import { cairoInstant, cairoToday } from "@/lib/dates";
import { ForbiddenError } from "@/lib/errors";
import { checkBookingCode, checkSupervisorCode } from "@/lib/qr/secrets";
import { getSetting } from "@/lib/settings/service";
import { assignment, bookingScope, canViewTrip, inScope, scopeCondition, type BookingScope } from "@/lib/supervisors/scope";
import { getTrip } from "@/lib/trips/service";

/**
 * Trip run and attendance (plan §5.5–§6.1):
 * - "start trip" (admin, on the trip day) opens the first gathering on all confirmed bookings;
 * - each one ends up present / late / absent, then "confirm trip count" fixes the roster;
 *   absent there means out of the trip: no QR, no later gatherings;
 * - later gatherings run on the fixed roster; lateness counts from the device scan time;
 * - supervisors' records wait for an admin unless they may confirm directly.
 * Scans and manual marks all go through `syncAttendance`, online or after an offline spell.
 */

type Fail = { ok: false; error: string };
type Result<T = object> = ({ ok: true } & T) | Fail;
const fail = (error: string): Fail => ({ ok: false, error });

const ADMIN: Ability = "manage_activities";
/** Clock drift tolerated around a gathering's open window and "now". */
const SKEW_MS = 2 * 60 * 1000;
export const FIRST_CHECKPOINT_NAME = "التجمع الأول";

function assertCan(actor: SessionUser, ability: Ability) {
  if (!can(actor, ability)) throw new ForbiddenError();
}

const audit = (actor: SessionUser, action: string, subjectType: string, subjectId: number, meta: Record<string, unknown>, ctx: RequestCtx) =>
  recordAudit({ actor: { type: "user", id: actor.id }, action, subjectType, subjectId, meta }, ctx);

/** Standing records: not rejected by the QR check and not voided by an admin. */
export const activeRecord = () => and(isNull(attendances.rejectedReason), isNull(attendances.voidedAt));

/** On `bookings`: marked absent in the first gathering (final absence). */
export function finalAbsentCondition(): SQL {
  return exists(
    db
      .select({ one: sql`1` })
      .from(attendances)
      .innerJoin(checkpoints, eq(checkpoints.id, attendances.checkpointId))
      .where(and(eq(attendances.bookingId, bookings.id), eq(checkpoints.sortOrder, 1), eq(attendances.status, "absent"), activeRecord())),
  );
}

export function lateness(cp: Pick<Checkpoint, "scheduledAt">, graceMinutes: number, at: Date): Exclude<AttendanceStatus, "absent"> {
  if (!cp.scheduledAt) return "present";
  return at.getTime() > cp.scheduledAt.getTime() + graceMinutes * 60_000 ? "late" : "present";
}

/** "Start trip" shows on the trip day only (Cairo time). */
export const canStartToday = (trip: Pick<Activity, "status" | "date">) => trip.status === "upcoming" && trip.date === cairoToday();

// ─── Start / end ─────────────────────────────────────────────────────────────

export async function startTrip(actor: SessionUser, id: number, ctx: RequestCtx): Promise<Result> {
  assertCan(actor, ADMIN);
  const trip = await getTrip(id);
  if (!trip) return fail("الرحلة مش موجودة");
  if (trip.status !== "upcoming") return fail(trip.status === "ongoing" ? "الرحلة بدأت بالفعل" : "الرحلة انتهت");
  if (trip.date !== cairoToday()) return fail("زرار البدء بيشتغل في يوم الرحلة بس");

  const now = new Date();
  const started = await db.transaction(async (tx) => {
    const [row] = await tx
      .update(activities)
      .set({ status: "ongoing", startedAt: now, bookingOpen: false })
      .where(and(eq(activities.id, id), eq(activities.status, "upcoming")))
      .returning({ id: activities.id });
    if (!row) return false;
    await tx.insert(checkpoints).values({
      activityId: id,
      name: FIRST_CHECKPOINT_NAME,
      sortOrder: 1,
      scheduledAt: trip.startTime ? cairoInstant(trip.date, trip.startTime) : now,
      openedAt: now,
      createdBy: actor.id,
    });
    return true;
  });
  if (!started) return fail("الرحلة اتغيّرت، حدّث الصفحة");
  await audit(actor, "activity.started", "activity", id, { title: trip.title }, ctx);
  return { ok: true };
}

export async function endTrip(actor: SessionUser, id: number, ctx: RequestCtx): Promise<Result> {
  assertCan(actor, ADMIN);
  const trip = await getTrip(id);
  if (!trip) return fail("الرحلة مش موجودة");
  if (trip.status !== "ongoing") return fail("زرار الإنهاء للرحلات الحالية بس");
  const now = new Date();
  await db.transaction(async (tx) => {
    await tx.update(activities).set({ status: "finished", endedAt: now }).where(eq(activities.id, id));
    await tx
      .update(checkpoints)
      .set({ closedAt: now })
      .where(and(eq(checkpoints.activityId, id), isNotNull(checkpoints.openedAt), isNull(checkpoints.closedAt)));
  });
  await audit(actor, "activity.ended", "activity", id, { title: trip.title }, ctx);
  return { ok: true };
}

/** finished → ongoing only with an explicit confirmation, and it's audited (plan §3). */
export async function reopenTrip(actor: SessionUser, id: number, confirmed: boolean, ctx: RequestCtx): Promise<Result> {
  assertCan(actor, ADMIN);
  if (!confirmed) return fail("لازم تأكيد صريح عشان ترجّع الرحلة حالية");
  const trip = await getTrip(id);
  if (!trip) return fail("الرحلة مش موجودة");
  if (trip.status !== "finished") return fail("الرحلة مش منتهية");
  await db.update(activities).set({ status: "ongoing", endedAt: null }).where(eq(activities.id, id));
  await audit(actor, "activity.reopened", "activity", id, { title: trip.title, endedAt: trip.endedAt }, ctx);
  return { ok: true };
}

// ─── Gatherings ──────────────────────────────────────────────────────────────

export function listCheckpoints(activityId: number) {
  return db.select().from(checkpoints).where(eq(checkpoints.activityId, activityId)).orderBy(asc(checkpoints.sortOrder));
}

async function loadCheckpoint(actor: SessionUser, id: number) {
  const [row] = await db.select({ cp: checkpoints, trip: activities }).from(checkpoints).innerJoin(activities, eq(activities.id, checkpoints.activityId)).where(eq(checkpoints.id, id));
  if (!row || !(await canViewTrip(actor, row.trip.id))) return null;
  return row;
}

export const checkpointInputSchema = z.object({
  name: z.string().trim().min(2, "اكتب اسم التجمع").max(150),
  time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "اكتب ميعاد التجمع"),
});

export async function addCheckpoint(
  actor: SessionUser,
  activityId: number,
  input: z.input<typeof checkpointInputSchema>,
  ctx: RequestCtx,
): Promise<Result<{ id: number }> | { ok: false; error?: string; errors: Record<string, string> }> {
  assertCan(actor, "manage_gatherings");
  const trip = await getTrip(activityId);
  if (!trip || !(await canViewTrip(actor, activityId))) return fail("الرحلة مش موجودة");
  if (trip.status !== "ongoing") return fail("التجمعات بتتضاف والرحلة حالية بس");
  if (!trip.rosterLockedAt) return fail("أكّد عدد الرحلة في التجمع الأول الأول");
  const parsed = checkpointInputSchema.safeParse(input);
  if (!parsed.success) {
    const errors: Record<string, string> = {};
    for (const i of parsed.error.issues) errors[String(i.path[0])] ??= i.message;
    return { ok: false, errors };
  }

  const [{ last }] = await db.select({ last: max(checkpoints.sortOrder) }).from(checkpoints).where(eq(checkpoints.activityId, activityId));
  const [cp] = await db
    .insert(checkpoints)
    .values({
      activityId,
      name: parsed.data.name,
      sortOrder: (last ?? 0) + 1,
      scheduledAt: cairoInstant(cairoToday(), parsed.data.time),
      createdBy: actor.id,
    })
    .returning({ id: checkpoints.id });
  await audit(actor, "checkpoint.created", "checkpoint", cp.id, { activityId, name: parsed.data.name, time: parsed.data.time }, ctx);
  return { ok: true, id: cp.id };
}

export async function setCheckpointOpen(actor: SessionUser, id: number, open: boolean, ctx: RequestCtx): Promise<Result> {
  assertCan(actor, "manage_gatherings");
  const row = await loadCheckpoint(actor, id);
  if (!row) return fail("التجمع مش موجود");
  const { cp, trip } = row;
  if (trip.status !== "ongoing") return fail("الرحلة مش حالية");
  if (cp.sortOrder === 1) return fail("التجمع الأول بيتقفل مع تأكيد عدد الرحلة");

  if (open) {
    if (cp.openedAt && !cp.closedAt) return fail("التجمع مفتوح بالفعل");
    const [other] = await db
      .select({ name: checkpoints.name })
      .from(checkpoints)
      .where(and(eq(checkpoints.activityId, trip.id), isNotNull(checkpoints.openedAt), isNull(checkpoints.closedAt)));
    if (other) return fail(`اقفل «${other.name}» الأول`);
    await db
      .update(checkpoints)
      .set({ openedAt: cp.openedAt ?? new Date(), closedAt: null })
      .where(eq(checkpoints.id, id));
  } else {
    if (!cp.openedAt || cp.closedAt) return fail("التجمع مش مفتوح");
    await db.update(checkpoints).set({ closedAt: new Date() }).where(eq(checkpoints.id, id));
  }
  await audit(actor, open ? "checkpoint.opened" : "checkpoint.closed", "checkpoint", id, { activityId: trip.id, name: cp.name }, ctx);
  return { ok: true };
}

export const isOpen = (cp: Pick<Checkpoint, "openedAt" | "closedAt">) => Boolean(cp.openedAt && !cp.closedAt);

// ─── Roster ──────────────────────────────────────────────────────────────────

export type RowState = AttendanceStatus | "pending" | "unrecorded";

/**
 * The students a gathering covers (confirmed bookings within the actor's scope; after
 * the first gathering, minus the final absentees) with their standing record.
 */
export async function checkpointRoster(trip: Activity, cp: Checkpoint, scope: BookingScope) {
  const rows = await db
    .select({
      bookingId: bookings.id,
      name: students.name,
      phone: students.phone,
      year: students.year,
      facultyName: faculties.name,
      busName: buses.name,
      record: attendances,
    })
    .from(bookings)
    .innerJoin(students, eq(students.id, bookings.studentId))
    .innerJoin(faculties, eq(faculties.id, students.facultyId))
    .leftJoin(buses, eq(buses.id, bookings.busId))
    .leftJoin(attendances, and(eq(attendances.bookingId, bookings.id), eq(attendances.checkpointId, cp.id), activeRecord()))
    .where(
      and(
        eq(bookings.activityId, trip.id),
        eq(bookings.status, "confirmed"),
        scopeCondition(scope),
        cp.sortOrder > 1 ? sql`not ${finalAbsentCondition()}` : undefined,
      ),
    )
    .orderBy(asc(students.name));
  return rows.map((r) => ({ ...r, state: rowState(r.record) }));
}

export function rowState(record: Attendance | null): RowState {
  if (!record) return "unrecorded";
  return record.confirmedAt ? record.status : "pending";
}

export function tallies(rows: { state: RowState }[]) {
  const t: Record<RowState, number> = { present: 0, late: 0, absent: 0, pending: 0, unrecorded: 0 };
  for (const r of rows) t[r.state]++;
  return { ...t, total: rows.length };
}

/** QR records the server refused (bad or revoked code), for the admin and the scanner. */
export async function rejectedRecords(cp: Checkpoint, scope: BookingScope) {
  return db
    .select({ id: attendances.id, reason: attendances.rejectedReason, recordedAt: attendances.recordedAt, name: students.name, recorder: users.name })
    .from(attendances)
    .innerJoin(bookings, eq(bookings.id, attendances.bookingId))
    .innerJoin(students, eq(students.id, bookings.studentId))
    .leftJoin(users, eq(users.id, attendances.recordedBy))
    .where(and(eq(attendances.checkpointId, cp.id), isNotNull(attendances.rejectedReason), scopeCondition(scope)))
    .orderBy(asc(attendances.recordedAt));
}

/** Students out of the trip after the first gathering. */
export async function finalAbsentees(activityId: number, scope: BookingScope) {
  return db
    .select({ bookingId: bookings.id, name: students.name, phone: students.phone })
    .from(bookings)
    .innerJoin(students, eq(students.id, bookings.studentId))
    .where(and(eq(bookings.activityId, activityId), eq(bookings.status, "confirmed"), scopeCondition(scope), finalAbsentCondition()))
    .orderBy(asc(students.name));
}

// ─── Recording (scan / manual, online or synced later) ───────────────────────

const recordBase = {
  clientUuid: z.uuid(),
  method: z.enum(["qr", "manual"]),
  code: z.string().regex(/^\d{8}$/).optional(),
  recordedAt: z.number().int().positive(),
};

export const syncRecordSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("student"), checkpointId: z.number().int().positive(), bookingId: z.number().int().positive(), ...recordBase }),
  z.object({ kind: z.literal("staff"), userId: z.number().int().positive(), ...recordBase }),
]);

export type SyncRecord = z.infer<typeof syncRecordSchema>;

export type SyncResult = "recorded" | "pending" | "duplicate" | "invalid" | "revoked" | "not_in_trip" | "closed" | "forbidden" | "error";
export type SyncOutcome = { clientUuid: string; result: SyncResult; message: string; name?: string; status?: AttendanceStatus };

export const MAX_SYNC_BATCH = 500;

const REJECTION_MESSAGES = { invalid: "QR منتهي أو مش صحيح", revoked: "الحجز ده اتلغى، الـ QR مبقاش شغال" } as const;

type SyncContext = {
  actor: SessionUser;
  trip: Activity;
  scope: BookingScope;
  checkpoints: Map<number, Checkpoint>;
  now: number;
};

/**
 * Stores scans and manual marks. Every record answers on its own: one bad record never
 * blocks the rest of an offline batch, and a record sent twice gets the same answer.
 */
export async function syncAttendance(actor: SessionUser, activityId: number, records: unknown[]): Promise<Result<{ outcomes: SyncOutcome[] }>> {
  if (!can(actor, "take_attendance") && !can(actor, ADMIN)) throw new ForbiddenError();
  const trip = await getTrip(activityId);
  if (!trip || !(await canViewTrip(actor, activityId))) return fail("الرحلة مش موجودة");
  if (!Array.isArray(records) || records.length > MAX_SYNC_BATCH) return fail("عدد التسجيلات كبير");

  const sc: SyncContext = {
    actor,
    trip,
    scope: await bookingScope(actor, trip),
    checkpoints: new Map((await listCheckpoints(trip.id)).map((c) => [c.id, c])),
    now: Date.now(),
  };
  const outcomes: SyncOutcome[] = [];
  for (const raw of records) {
    const parsed = syncRecordSchema.safeParse(raw);
    const uuid = typeof (raw as { clientUuid?: unknown })?.clientUuid === "string" ? String((raw as { clientUuid: string }).clientUuid).slice(0, 36) : "";
    if (!parsed.success) {
      outcomes.push({ clientUuid: uuid, result: "error", message: "تسجيل غير صالح" });
      continue;
    }
    try {
      outcomes.push(parsed.data.kind === "student" ? await recordStudent(sc, parsed.data) : await recordStaff(sc, parsed.data));
    } catch (e) {
      if (e instanceof ForbiddenError) throw e;
      console.error("attendance sync", e);
      outcomes.push({ clientUuid: uuid, result: "error", message: "حصل خطأ، هيتعاد رفعه" });
    }
  }
  return { ok: true, outcomes };
}

function outcomeOf(rec: Attendance, name: string): SyncOutcome {
  if (rec.rejectedReason === "invalid" || rec.rejectedReason === "revoked") {
    return { clientUuid: rec.clientUuid, result: rec.rejectedReason, message: REJECTION_MESSAGES[rec.rejectedReason], name };
  }
  if (rec.voidedAt) return { clientUuid: rec.clientUuid, result: "duplicate", message: "التسجيل ده اتلغى من الأدمن", name };
  return rec.confirmedAt
    ? { clientUuid: rec.clientUuid, result: "recorded", message: rec.status === "late" ? "اتسجل متأخر" : "اتسجل حضور", name, status: rec.status }
    : { clientUuid: rec.clientUuid, result: "pending", message: "اتسجل، مستني تأكيد الأدمن", name, status: rec.status };
}

async function recordStudent(sc: SyncContext, rec: Extract<SyncRecord, { kind: "student" }>): Promise<SyncOutcome> {
  const { actor, trip } = sc;
  const out = (result: SyncResult, message: string, name?: string): SyncOutcome => ({ clientUuid: rec.clientUuid, result, message, name });
  if (!can(actor, "take_attendance")) return out("forbidden", "مش عندك صلاحية أخذ الحضور");

  const [b] = await db
    .select({ id: bookings.id, status: bookings.status, busId: bookings.busId, name: students.name })
    .from(bookings)
    .innerJoin(students, eq(students.id, bookings.studentId))
    .where(and(eq(bookings.id, rec.bookingId), eq(bookings.activityId, trip.id)));
  if (!b) return out("not_in_trip", "الطالب مش في الرحلة دي");
  if (!inScope(sc.scope, b)) return out("forbidden", "الطالب ده مش في أتوبيسك");

  // Idempotent re-upload: the same device record always gets the same answer.
  const [seen] = await db.select().from(attendances).where(eq(attendances.clientUuid, rec.clientUuid));
  if (seen) return seen.bookingId === b.id ? outcomeOf(seen, b.name) : out("error", "تسجيل غير صالح");

  const cp = sc.checkpoints.get(rec.checkpointId);
  if (!cp) return out("closed", "التجمع ده مش موجود", b.name);
  if (b.status !== "confirmed") {
    return rec.method === "qr" ? reject(sc, rec, cp, "revoked", b.name) : out("not_in_trip", "حجز الطالب مش مؤكد", b.name);
  }
  if (cp.sortOrder > 1 && (await isFinalAbsent(b.id))) return out("not_in_trip", "الطالب متعلّم غياب نهائي من التجمع الأول", b.name);

  const at = new Date(rec.recordedAt);
  if (rec.recordedAt > sc.now + SKEW_MS) return out("error", "ساعة الموبايل متقدمة، ظبطها وسجّل تاني", b.name);
  if (cp.sortOrder === 1 && trip.rosterLockedAt) return out("closed", "عدد الرحلة اتأكد والتجمع الأول اتقفل", b.name);
  if (!cp.openedAt || rec.recordedAt < cp.openedAt.getTime() - SKEW_MS || (cp.closedAt && rec.recordedAt > cp.closedAt.getTime() + SKEW_MS)) {
    return out("closed", "التجمع كان مقفول وقت التسجيل", b.name);
  }

  let verified = false;
  if (rec.method === "qr") {
    const check = rec.code ? await checkBookingCode(b.id, rec.code, rec.recordedAt) : "invalid";
    if (check !== "ok") return reject(sc, rec, cp, check, b.name);
    verified = true;
  }

  const status = lateness(cp, trip.lateGraceMinutes, at);
  const direct = actor.role !== "supervisor" || can(actor, "direct_attendance");
  const values = {
    status,
    method: rec.method,
    recordedAt: at,
    recordedBy: actor.id,
    clientUuid: rec.clientUuid,
    verified,
    confirmedBy: direct ? actor.id : null,
    confirmedAt: direct ? new Date() : null,
  };

  const [inserted] = await db
    .insert(attendances)
    .values({ checkpointId: cp.id, bookingId: b.id, ...values })
    .onConflictDoNothing()
    .returning();
  if (inserted) return outcomeOf(inserted, b.name);

  const [standing] = await db
    .select()
    .from(attendances)
    .where(and(eq(attendances.checkpointId, cp.id), eq(attendances.bookingId, b.id), activeRecord()));
  if (!standing) return out("error", "حصل خطأ، هيتعاد رفعه", b.name);

  if (standing.status === "absent") {
    // Marked absent before the count was confirmed, but the student showed up after all.
    const [updated] = await db.update(attendances).set({ ...values, syncedAt: new Date() }).where(eq(attendances.id, standing.id)).returning();
    return outcomeOf(updated, b.name);
  }
  // Two devices scanned the same student: the earliest scan time wins. Only a scan whose
  // time is proven (a verified QR code) or a record its author may confirm can move it;
  // otherwise a backdated manual record would turn "late" into "present" unreviewed.
  if (at < standing.recordedAt && (verified || direct)) {
    await db.update(attendances).set({ recordedAt: at, status }).where(eq(attendances.id, standing.id));
  }
  return { ...out("duplicate", "الطالب متسجل قبل كده", b.name), status: standing.status };
}

async function reject(sc: SyncContext, rec: Extract<SyncRecord, { kind: "student" }>, cp: Checkpoint, reason: "invalid" | "revoked", name: string): Promise<SyncOutcome> {
  await db
    .insert(attendances)
    .values({
      checkpointId: cp.id,
      bookingId: rec.bookingId,
      status: lateness(cp, sc.trip.lateGraceMinutes, new Date(rec.recordedAt)),
      method: "qr",
      recordedAt: new Date(rec.recordedAt),
      recordedBy: sc.actor.id,
      clientUuid: rec.clientUuid,
      rejectedReason: reason,
    })
    .onConflictDoNothing();
  return { clientUuid: rec.clientUuid, result: reason, message: REJECTION_MESSAGES[reason], name };
}

async function isFinalAbsent(bookingId: number) {
  const [row] = await db.select({ id: bookings.id }).from(bookings).where(and(eq(bookings.id, bookingId), finalAbsentCondition()));
  return Boolean(row);
}

async function recordStaff(sc: SyncContext, rec: Extract<SyncRecord, { kind: "staff" }>): Promise<SyncOutcome> {
  const out = (result: SyncResult, message: string, name?: string): SyncOutcome => ({ clientUuid: rec.clientUuid, result, message, name });
  if (!can(sc.actor, ADMIN)) return out("forbidden", "تسجيل حضور المشرفين للأدمن بس");
  const [u] = await db.select({ name: users.name }).from(users).where(and(eq(users.id, rec.userId), eq(users.role, "supervisor")));
  if (!u || !(await assignment(rec.userId, sc.trip.id))) return out("not_in_trip", "المشرف ده مش على الرحلة", u?.name);
  if (rec.recordedAt > sc.now + SKEW_MS) return out("error", "ساعة الموبايل متقدمة، ظبطها وسجّل تاني", u.name);
  if (rec.method === "qr") {
    const check = rec.code ? await checkSupervisorCode(rec.userId, rec.code, rec.recordedAt) : "invalid";
    if (check === "invalid") return out("invalid", "QR منتهي أو مش صحيح", u.name);
    if (check === "revoked") return out("revoked", "حساب المشرف ده موقوف", u.name);
  }
  const [row] = await db
    .insert(supervisorAttendances)
    .values({ activityId: sc.trip.id, userId: rec.userId, method: rec.method, recordedAt: new Date(rec.recordedAt), recordedBy: sc.actor.id })
    .onConflictDoNothing()
    .returning();
  return row ? out("recorded", "اتسجل حضور المشرف", u.name) : out("duplicate", "المشرف متسجل قبل كده", u.name);
}

// ─── Admin decisions ─────────────────────────────────────────────────────────

async function loadRecord(actor: SessionUser, id: number) {
  const [row] = await db
    .select({ rec: attendances, cp: checkpoints, trip: activities })
    .from(attendances)
    .innerJoin(checkpoints, eq(checkpoints.id, attendances.checkpointId))
    .innerJoin(activities, eq(activities.id, checkpoints.activityId))
    .where(eq(attendances.id, id));
  return row && (await canViewTrip(actor, row.trip.id)) ? row : null;
}

/** First gathering only: the admin decides who didn't come (plan §5.6 step 4). */
export async function markAbsent(actor: SessionUser, checkpointId: number, bookingId: number, ctx: RequestCtx): Promise<Result> {
  assertCan(actor, ADMIN);
  const row = await loadCheckpoint(actor, checkpointId);
  if (!row) return fail("التجمع مش موجود");
  const { cp, trip } = row;
  if (cp.sortOrder !== 1) return fail("الغياب النهائي بيتسجل في التجمع الأول بس");
  if (trip.rosterLockedAt) return fail("عدد الرحلة اتأكد بالفعل");
  const [b] = await db
    .select({ id: bookings.id })
    .from(bookings)
    .where(and(eq(bookings.id, bookingId), eq(bookings.activityId, trip.id), eq(bookings.status, "confirmed")));
  if (!b) return fail("الطالب مش في الرحلة");

  const now = new Date();
  const [inserted] = await db
    .insert(attendances)
    .values({
      checkpointId,
      bookingId,
      status: "absent",
      method: "manual",
      recordedAt: now,
      recordedBy: actor.id,
      clientUuid: crypto.randomUUID(),
      confirmedBy: actor.id,
      confirmedAt: now,
    })
    .onConflictDoNothing()
    .returning({ id: attendances.id });
  if (!inserted) return fail("الطالب متسجل بالفعل. الغي تسجيله الأول لو عايز تعلّمه غياب");
  await audit(actor, "attendance.marked_absent", "booking", bookingId, { activityId: trip.id, checkpointId }, ctx);
  return { ok: true };
}

export async function markRemainingAbsent(actor: SessionUser, checkpointId: number, ctx: RequestCtx): Promise<Result<{ count: number }>> {
  assertCan(actor, ADMIN);
  const row = await loadCheckpoint(actor, checkpointId);
  if (!row) return fail("التجمع مش موجود");
  const { cp, trip } = row;
  if (cp.sortOrder !== 1) return fail("الغياب النهائي بيتسجل في التجمع الأول بس");
  if (trip.rosterLockedAt) return fail("عدد الرحلة اتأكد بالفعل");

  const remaining = (await checkpointRoster(trip, cp, { kind: "all" })).filter((r) => r.state === "unrecorded");
  if (!remaining.length) return fail("مفيش حد لسه متسجلش");
  const now = new Date();
  const inserted = await db
    .insert(attendances)
    .values(
      remaining.map((r) => ({
        checkpointId,
        bookingId: r.bookingId,
        status: "absent" as const,
        method: "manual" as const,
        recordedAt: now,
        recordedBy: actor.id,
        clientUuid: crypto.randomUUID(),
        confirmedBy: actor.id,
        confirmedAt: now,
      })),
    )
    .onConflictDoNothing()
    .returning({ id: attendances.id });
  await audit(actor, "attendance.remaining_absent", "checkpoint", checkpointId, { activityId: trip.id, count: inserted.length }, ctx);
  return { ok: true, count: inserted.length };
}

/** Confirms one supervisor record, or every waiting one in the gathering. */
export async function confirmRecords(actor: SessionUser, checkpointId: number, recordId: number | null, ctx: RequestCtx): Promise<Result<{ count: number }>> {
  assertCan(actor, ADMIN);
  const row = await loadCheckpoint(actor, checkpointId);
  if (!row) return fail("التجمع مش موجود");
  const updated = await db
    .update(attendances)
    .set({ confirmedBy: actor.id, confirmedAt: new Date() })
    .where(
      and(
        eq(attendances.checkpointId, checkpointId),
        recordId ? eq(attendances.id, recordId) : undefined,
        isNull(attendances.confirmedAt),
        activeRecord(),
      ),
    )
    .returning({ id: attendances.id });
  if (!updated.length) return fail(recordId ? "التسجيل ده مش مستني تأكيد" : "مفيش تسجيلات مستنية تأكيد");
  await audit(actor, "attendance.confirmed", "checkpoint", checkpointId, { activityId: row.trip.id, count: updated.length, recordId }, ctx);
  return { ok: true, count: updated.length };
}

/** An admin may cancel any record, even a confirmed one (plan §6). */
export async function voidRecord(actor: SessionUser, recordId: number, ctx: RequestCtx): Promise<Result> {
  assertCan(actor, ADMIN);
  const row = await loadRecord(actor, recordId);
  if (!row) return fail("التسجيل مش موجود");
  const { rec, cp, trip } = row;
  if (rec.voidedAt || rec.rejectedReason) return fail("التسجيل ده مش ساري");
  if (cp.sortOrder === 1 && trip.rosterLockedAt) {
    return fail(rec.status === "absent" ? "استخدم «إرجاع للرحلة» للطالب ده" : "عدد الرحلة اتأكد. لو الطالب مكانش موجود الغي حجزه");
  }
  await db.update(attendances).set({ voidedBy: actor.id, voidedAt: new Date() }).where(eq(attendances.id, recordId));
  await audit(
    actor,
    "attendance.voided",
    "booking",
    rec.bookingId,
    { activityId: trip.id, checkpointId: cp.id, status: rec.status, confirmed: Boolean(rec.confirmedAt) },
    ctx,
  );
  return { ok: true };
}

/** "Confirm trip count": every student decided and confirmed, then the roster is fixed. */
export async function lockRoster(actor: SessionUser, activityId: number, ctx: RequestCtx): Promise<Result<{ present: number; absent: number }>> {
  assertCan(actor, ADMIN);
  const trip = await getTrip(activityId);
  if (!trip) return fail("الرحلة مش موجودة");
  if (trip.status !== "ongoing") return fail("الرحلة مش حالية");
  if (trip.rosterLockedAt) return fail("عدد الرحلة اتأكد بالفعل");
  const [cp] = await db.select().from(checkpoints).where(and(eq(checkpoints.activityId, activityId), eq(checkpoints.sortOrder, 1)));
  if (!cp) return fail("التجمع الأول مش موجود");

  const t = tallies(await checkpointRoster(trip, cp, { kind: "all" }));
  if (t.unrecorded) return fail(`فيه ${t.unrecorded} طالب لسه متسجلوش. اختار حضور أو غياب لكل واحد`);
  if (t.pending) return fail(`فيه ${t.pending} تسجيل مستني التأكيد`);

  const now = new Date();
  const locked = await db.transaction(async (tx) => {
    const [row] = await tx
      .update(activities)
      .set({ rosterLockedAt: now, rosterLockedBy: actor.id })
      .where(and(eq(activities.id, activityId), isNull(activities.rosterLockedAt)))
      .returning({ id: activities.id });
    if (!row) return false;
    await tx.update(checkpoints).set({ closedAt: now }).where(eq(checkpoints.id, cp.id));
    return true;
  });
  if (!locked) return fail("عدد الرحلة اتأكد بالفعل");
  const present = t.present + t.late;
  await audit(actor, "activity.roster_locked", "activity", activityId, { present, absent: t.absent }, ctx);
  return { ok: true, present, absent: t.absent };
}

/** Brings a final absentee back for the coming gatherings (when the setting allows it). */
export async function restoreAbsent(actor: SessionUser, bookingId: number, ctx: RequestCtx): Promise<Result> {
  assertCan(actor, ADMIN);
  if ((await getSetting("restore_absent_student")) !== "allowed") return fail("إرجاع الطلبة المتعلّمين غياب ممنوع من الإعدادات");
  const [row] = await db
    .select({ rec: attendances, trip: activities })
    .from(attendances)
    .innerJoin(checkpoints, eq(checkpoints.id, attendances.checkpointId))
    .innerJoin(activities, eq(activities.id, checkpoints.activityId))
    .where(and(eq(attendances.bookingId, bookingId), eq(checkpoints.sortOrder, 1), eq(attendances.status, "absent"), activeRecord()));
  if (!row) return fail("الطالب مش متعلّم غياب نهائي");
  if (row.trip.status !== "ongoing") return fail("الرحلة مش حالية");
  await db.update(attendances).set({ voidedBy: actor.id, voidedAt: new Date() }).where(eq(attendances.id, row.rec.id));
  await audit(actor, "attendance.restored", "booking", bookingId, { activityId: row.trip.id }, ctx);
  return { ok: true };
}

// ─── Supervisors' attendance ─────────────────────────────────────────────────

export async function listSupervisorAttendance(activityId: number) {
  return db
    .select({ userId: users.id, name: users.name, busName: buses.name, recordedAt: supervisorAttendances.recordedAt, method: supervisorAttendances.method })
    .from(activitySupervisors)
    .innerJoin(users, eq(users.id, activitySupervisors.userId))
    .leftJoin(buses, eq(buses.id, activitySupervisors.busId))
    .leftJoin(supervisorAttendances, and(eq(supervisorAttendances.activityId, activityId), eq(supervisorAttendances.userId, users.id)))
    .where(and(eq(activitySupervisors.activityId, activityId), isNull(users.deletedAt)))
    .orderBy(asc(users.name));
}

export async function removeSupervisorAttendance(actor: SessionUser, activityId: number, userId: number, ctx: RequestCtx): Promise<Result> {
  assertCan(actor, ADMIN);
  const removed = await db
    .delete(supervisorAttendances)
    .where(and(eq(supervisorAttendances.activityId, activityId), eq(supervisorAttendances.userId, userId)))
    .returning({ userId: supervisorAttendances.userId });
  if (!removed.length) return fail("المشرف مش متسجل");
  await audit(actor, "attendance.supervisor_removed", "user", userId, { activityId }, ctx);
  return { ok: true };
}

// ─── Offline pack for the scanner (plan §6.1) ────────────────────────────────

export type ScanPack = {
  trip: { id: number; title: string; date: string; status: Activity["status"]; rosterLocked: boolean };
  checkpoints: { id: number; name: string; sortOrder: number; open: boolean; openedAt: number | null; closedAt: number | null }[];
  /** Names and contact only; no national IDs and no QR secrets leave the server. */
  students: { bookingId: number; name: string; faculty: string; year: number; phone: string; bus: string | null; out: boolean }[];
  /** Booking ids with a standing record, per gathering, so the scanner flags repeats offline. */
  recorded: Record<number, number[]>;
  supervisors: { userId: number; name: string; present: boolean }[] | null;
  canManual: boolean;
  generatedAt: number;
};

export async function scanPack(actor: SessionUser, trip: Activity): Promise<ScanPack> {
  const scope = await bookingScope(actor, trip);
  const [cps, rows, absent] = await Promise.all([
    listCheckpoints(trip.id),
    db
      .select({
        bookingId: bookings.id,
        name: students.name,
        faculty: faculties.name,
        year: students.year,
        phone: students.phone,
        bus: buses.name,
      })
      .from(bookings)
      .innerJoin(students, eq(students.id, bookings.studentId))
      .innerJoin(faculties, eq(faculties.id, students.facultyId))
      .leftJoin(buses, eq(buses.id, bookings.busId))
      .where(and(eq(bookings.activityId, trip.id), eq(bookings.status, "confirmed"), scopeCondition(scope)))
      .orderBy(asc(students.name)),
    db
      .select({ id: bookings.id })
      .from(bookings)
      .where(and(eq(bookings.activityId, trip.id), finalAbsentCondition())),
  ]);
  const out = new Set(absent.map((a) => a.id));
  const cpIds = cps.map((c) => c.id);
  const recs = cpIds.length
    ? await db
        .select({ cp: attendances.checkpointId, b: attendances.bookingId })
        .from(attendances)
        .where(and(inArray(attendances.checkpointId, cpIds), activeRecord()))
    : [];
  const recorded: Record<number, number[]> = Object.fromEntries(cpIds.map((id) => [id, [] as number[]]));
  for (const r of recs) recorded[r.cp].push(r.b);

  const supervisors = can(actor, ADMIN)
    ? (await listSupervisorAttendance(trip.id)).map((s) => ({ userId: s.userId, name: s.name, present: Boolean(s.recordedAt) }))
    : null;

  return {
    trip: { id: trip.id, title: trip.title, date: trip.date, status: trip.status, rosterLocked: Boolean(trip.rosterLockedAt) },
    checkpoints: cps.map((c) => ({
      id: c.id,
      name: c.name,
      sortOrder: c.sortOrder,
      open: isOpen(c) && !(c.sortOrder === 1 && trip.rosterLockedAt),
      openedAt: c.openedAt?.getTime() ?? null,
      closedAt: c.closedAt?.getTime() ?? null,
    })),
    students: rows.map((r) => ({ ...r, out: out.has(r.bookingId) })),
    recorded,
    supervisors,
    canManual: can(actor, "take_attendance"),
    generatedAt: Date.now(),
  };
}

export async function countPendingRecords(activityId: number) {
  const [row] = await db
    .select({ n: count() })
    .from(attendances)
    .innerJoin(checkpoints, eq(checkpoints.id, attendances.checkpointId))
    .where(and(eq(checkpoints.activityId, activityId), isNull(attendances.confirmedAt), activeRecord()));
  return row.n;
}
