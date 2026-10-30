import { and, asc, count, desc, eq, ilike, inArray, isNotNull, isNull, max, ne, or, sql, sum, type SQL } from "drizzle-orm";
import { db, type DB } from "@/db";
import { activities, bookings, buses, faculties, students, type Activity, type BookingStatus, type Student } from "@/db/schema";
import { recordAudit, type RequestCtx } from "@/lib/audit";
import type { SessionUser } from "@/lib/auth/service";
import { can, type Ability } from "@/lib/authz";
import { cairoToday } from "@/lib/dates";
import { ForbiddenError } from "@/lib/errors";
import { lockedFor, registerFailure } from "@/lib/rate-limit";
import { getSetting } from "@/lib/settings/service";
import { bookingScope, inScope, scopeCondition, type BookingScope } from "@/lib/supervisors/scope";
import { studentInputSchema, toLatinDigits, type StudentData, type StudentInput } from "@/lib/students/validation";

type Tx = Parameters<Parameters<DB["transaction"]>[0]>[0];
type Executor = DB | Tx;

type Fail = { ok: false; error?: string; errors?: Record<string, string> };
type Result<T = object> = ({ ok: true } & T) | Fail;

const fail = (error: string): Fail => ({ ok: false, error });

/** Bookings that hold a seat. Waitlisted and cancelled ones do not. */
const OCCUPYING: BookingStatus[] = ["pending", "confirmed"];

export const PUBLIC_BOOKING_LIMITS = {
  // Generous per IP: a whole faculty may book from the same campus network.
  ip: { limit: 60, windowSeconds: 10 * 60, lockSeconds: 10 * 60 },
  nationalId: { limit: 5, windowSeconds: 15 * 60, lockSeconds: 15 * 60 },
};

function assertCan(actor: SessionUser, ability: Ability) {
  if (!can(actor, ability)) throw new ForbiddenError();
}

function zodErrors(issues: { path: PropertyKey[]; message: string }[]) {
  const errors: Record<string, string> = {};
  for (const issue of issues) errors[String(issue.path[0] ?? "_")] ??= issue.message;
  return errors;
}

async function occupiedSeats(ex: Executor, activityId: number) {
  const [row] = await ex
    .select({ n: count() })
    .from(bookings)
    .where(and(eq(bookings.activityId, activityId), inArray(bookings.status, OCCUPYING)));
  return row.n;
}

export type Availability = "open" | "waitlist" | "full" | "closed";

/** Whether the public form accepts bookings, and how. A freed seat reopens a full trip. */
export function availability(trip: Activity, occupied: number): Availability {
  if (trip.status !== "upcoming" || !trip.bookingOpen || trip.date < cairoToday()) return "closed";
  if (occupied < trip.capacity) return "open";
  return trip.whenFull === "waitlist" ? "waitlist" : "full";
}

export async function getPublicTrip(token: string) {
  if (!/^[A-Za-z0-9_-]{10,64}$/.test(token)) return null;
  const [trip] = await db.select().from(activities).where(eq(activities.publicToken, token));
  if (!trip) return null;
  return { trip, availability: availability(trip, await occupiedSeats(db, trip.id)) };
}

async function activeFacultyExists(id: number) {
  const [row] = await db
    .select({ id: faculties.id })
    .from(faculties)
    .where(and(eq(faculties.id, id), eq(faculties.isActive, true)));
  return Boolean(row);
}

function differingFields(student: Student, data: StudentData) {
  const fields: string[] = [];
  if (student.name !== data.name) fields.push("name");
  if (student.phone !== data.phone) fields.push("phone");
  if (student.facultyId !== data.facultyId) fields.push("facultyId");
  if (student.year !== data.year) fields.push("year");
  return fields;
}

const studentFields = (d: StudentData) => ({ name: d.name, phone: d.phone, facultyId: d.facultyId, year: d.year });

async function findOrCreateStudent(tx: Tx, data: StudentData) {
  const [existing] = await tx.select().from(students).where(eq(students.nationalId, data.nationalId));
  if (existing) return { student: existing, created: false };
  // Another trip's booking may insert the same student concurrently.
  const [inserted] = await tx.insert(students).values(data).onConflictDoNothing().returning();
  if (inserted) return { student: inserted, created: true };
  const [raced] = await tx.select().from(students).where(eq(students.nationalId, data.nationalId));
  return { student: raced, created: false };
}

/** Another non-cancelled booking of this student on the same date (plan §5.2). */
async function sameDayBooking(tx: Tx, studentId: number, trip: Activity) {
  const [row] = await tx
    .select({ id: activities.id, title: activities.title })
    .from(bookings)
    .innerJoin(activities, eq(activities.id, bookings.activityId))
    .where(
      and(eq(bookings.studentId, studentId), ne(bookings.status, "cancelled"), eq(activities.date, trip.date), ne(activities.id, trip.id)),
    );
  return row ?? null;
}

async function lockTrip(tx: Tx, where: SQL) {
  const [trip] = await tx.select().from(activities).where(where).for("update");
  return trip ?? null;
}

const EXISTING_BOOKING_MESSAGES: Record<BookingStatus, string> = {
  pending: "انت حاجز في الرحلة دي قبل كده، وطلبك في انتظار التأكيد",
  confirmed: "انت حاجز في الرحلة دي قبل كده، وحجزك متأكد",
  waitlisted: "انت مسجل في قائمة الانتظار للرحلة دي قبل كده",
  cancelled: "حجزك في الرحلة دي اتلغى قبل كده. لو عايز ترجع كلّم المسؤول عن الرحلة",
};

// ─── Public form ─────────────────────────────────────────────────────────────

export type PublicBookingResult = Result<{ status: "pending" | "waitlisted"; position: number | null }> & { locked?: number };

export async function submitPublicBooking(token: string, input: StudentInput, ctx: RequestCtx): Promise<PublicBookingResult> {
  const ipKey = `booking:ip:${ctx.ip ?? "unknown"}`;
  const { ip, nationalId: nid } = PUBLIC_BOOKING_LIMITS;
  const ipLocked = await lockedFor(ipKey, ip.limit);
  if (ipLocked) return { ok: false, error: "محاولات كتير من نفس الشبكة. استنى شوية وجرّب تاني", locked: ipLocked };
  await registerFailure(ipKey, ip.limit, ip.windowSeconds, ip.lockSeconds);

  const parsed = studentInputSchema.safeParse(input);
  if (!parsed.success) return { ok: false, errors: zodErrors(parsed.error.issues) };
  const data = parsed.data;

  const nidKey = `booking:nid:${data.nationalId}`;
  const nidLocked = await lockedFor(nidKey, nid.limit);
  if (nidLocked) return { ok: false, error: "محاولات كتير بنفس الرقم القومي. استنى شوية وجرّب تاني", locked: nidLocked };

  if (!(await activeFacultyExists(data.facultyId))) return { ok: false, errors: { facultyId: "اختار الكلية" } };
  const policy = await getSetting("duplicate_national_id_policy");

  const outcome = await db.transaction(async (tx) => {
    const trip = await lockTrip(tx, eq(activities.publicToken, token));
    if (!trip) return fail("الرحلة مش موجودة");
    const state = availability(trip, await occupiedSeats(tx, trip.id));
    if (state === "closed") return fail("الحجز في الرحلة دي مقفول");
    if (state === "full") return fail("العدد اكتمل والحجز اتقفل");

    const { student, created } = await findOrCreateStudent(tx, data);
    const [existing] = await tx
      .select({ status: bookings.status })
      .from(bookings)
      .where(and(eq(bookings.activityId, trip.id), eq(bookings.studentId, student.id)));
    if (existing) return fail(EXISTING_BOOKING_MESSAGES[existing.status]);

    const other = await sameDayBooking(tx, student.id, trip);
    if (other) return fail(`انت حاجز في رحلة «${other.title}» في نفس اليوم، ومينفعش تحجز رحلتين في يوم واحد`);

    const diff = created ? [] : differingFields(student, data);
    let dataHandling: "updated" | "kept" | "flagged" | null = null;
    if (diff.length) {
      if (policy === "update") {
        await tx.update(students).set(studentFields(data)).where(eq(students.id, student.id));
        dataHandling = "updated";
      } else {
        dataHandling = policy === "keep" ? "kept" : "flagged";
      }
    }

    let position: number | null = null;
    if (state === "waitlist") {
      const [row] = await tx.select({ n: max(bookings.waitlistPosition) }).from(bookings).where(eq(bookings.activityId, trip.id));
      position = (row.n ?? 0) + 1;
    }
    const status: "pending" | "waitlisted" = state === "waitlist" ? "waitlisted" : "pending";
    const [booking] = await tx
      .insert(bookings)
      .values({
        activityId: trip.id,
        studentId: student.id,
        status,
        source: "form",
        waitlistPosition: position,
        submittedData: dataHandling === "flagged" ? studentFields(data) : null,
      })
      .returning({ id: bookings.id });
    return { ok: true as const, bookingId: booking.id, tripId: trip.id, studentId: student.id, status, position, diff, dataHandling };
  });

  if (!outcome.ok) {
    await registerFailure(nidKey, nid.limit, nid.windowSeconds, nid.lockSeconds);
    return outcome;
  }
  await recordAudit(
    {
      actor: null,
      action: "booking.submitted",
      subjectType: "booking",
      subjectId: outcome.bookingId,
      meta: {
        activityId: outcome.tripId,
        studentId: outcome.studentId,
        status: outcome.status,
        ...(outcome.dataHandling ? { differentData: outcome.dataHandling, fields: outcome.diff } : {}),
      },
    },
    ctx,
  );
  return { ok: true, status: outcome.status, position: outcome.position };
}

// ─── Staff actions ───────────────────────────────────────────────────────────

export type ManualBookingInput = StudentInput & { allowSameDay?: boolean; paid?: boolean };

/** Staff-entered bookings go straight to confirmed (plan §5.2). */
export async function addManualBooking(
  actor: SessionUser,
  activityId: number,
  input: ManualBookingInput,
  ctx: RequestCtx,
): Promise<Result<{ bookingId: number }>> {
  assertCan(actor, "add_students");
  const parsed = studentInputSchema.safeParse(input);
  if (!parsed.success) return { ok: false, errors: zodErrors(parsed.error.issues) };
  const data = parsed.data;
  if (!(await activeFacultyExists(data.facultyId))) return { ok: false, errors: { facultyId: "اختار الكلية" } };
  // Only admins may book a student into two trips on the same day.
  const mayOverride = actor.role !== "supervisor" && input.allowSameDay === true;
  // Recording money stays with admins.
  const paid = input.paid === true && can(actor, "manage_activities");

  // Scope lookups use the shared connection, so they run before the transaction.
  const [preTrip] = await db.select().from(activities).where(and(eq(activities.id, activityId), eq(activities.type, "trip")));
  if (!preTrip) return fail("الرحلة مش موجودة");
  const scope = await bookingScope(actor, preTrip);
  if (scope.kind === "none") return fail("الرحلة مش موجودة");
  // A bus-scoped supervisor adds students to their own bus, otherwise they'd vanish from their list.
  const ownBus = scope.kind === "bus" && preTrip.busesEnabled ? scope.busId : null;
  if (scope.kind === "bus" && ownBus === null) return fail("انت مش متسكّن على أتوبيس في الرحلة دي، كلّم الأدمن");

  const outcome = await db.transaction(async (tx) => {
    const trip = await lockTrip(tx, and(eq(activities.id, activityId), eq(activities.type, "trip"))!);
    if (!trip) return fail("الرحلة مش موجودة");
    if (trip.status === "finished") return fail("الرحلة انتهت");
    if (trip.paymentRequired && !can(actor, "manage_activities")) return fail("الرحلة دي التأكيد فيها بعد الدفع، والإضافة فيها من الأدمن بس");
    if (trip.paymentRequired && !paid) {
      return { ok: false as const, errors: { paid: "الرحلة دي التأكيد فيها بعد الدفع، علّم إن الطالب دفع" } };
    }
    if ((await occupiedSeats(tx, trip.id)) >= trip.capacity) return fail("الرحلة مكتملة. زوّد العدد الأقصى الأول");

    const { student, created } = await findOrCreateStudent(tx, data);
    const [existing] = await tx
      .select()
      .from(bookings)
      .where(and(eq(bookings.activityId, trip.id), eq(bookings.studentId, student.id)));
    if (existing && existing.status !== "cancelled") {
      return fail(`الطالب ده حاجز بالفعل في الرحلة (${BOOKING_STATUS_LABELS[existing.status]})`);
    }

    const other = await sameDayBooking(tx, student.id, trip);
    if (other && !mayOverride) {
      return {
        ok: false as const,
        error: `الطالب حاجز في رحلة «${other.title}» في نفس اليوم`,
        errors: actor.role !== "supervisor" ? { allowSameDay: "علّم على «تخطي المنع» لو متأكد" } : undefined,
      };
    }

    if (ownBus !== null) {
      const [bus] = await tx.select().from(buses).where(eq(buses.id, ownBus));
      const [load] = await tx
        .select({ n: count() })
        .from(bookings)
        .where(and(eq(bookings.busId, ownBus), eq(bookings.status, "confirmed")));
      if (!bus || load.n >= bus.capacity) return fail(`${bus?.name ?? "الأتوبيس"} مليان`);
    }

    const diff = created ? [] : differingFields(student, data);
    if (diff.length) await tx.update(students).set(studentFields(data)).where(eq(students.id, student.id));

    const payment =
      trip.feeEnabled && paid ? { paidAmount: trip.feeAmount, paidAt: new Date(), paymentRecordedBy: actor.id } : {};
    const values = {
      status: "confirmed" as const,
      source: "manual" as const,
      waitlistPosition: null,
      submittedData: null,
      handledBy: actor.id,
      handledAt: new Date(),
      ...(ownBus !== null ? { busId: ownBus } : {}),
      ...payment,
    };
    const [booking] = existing
      ? await tx.update(bookings).set(values).where(eq(bookings.id, existing.id)).returning({ id: bookings.id })
      : await tx
          .insert(bookings)
          .values({ activityId: trip.id, studentId: student.id, ...values })
          .returning({ id: bookings.id });
    return { ok: true as const, bookingId: booking.id, studentId: student.id, diff, sameDay: other?.title, restored: Boolean(existing) };
  });

  if (!outcome.ok) return outcome;
  await recordAudit(
    {
      actor: { type: "user", id: actor.id },
      action: "booking.manual_added",
      subjectType: "booking",
      subjectId: outcome.bookingId,
      meta: {
        activityId,
        studentId: outcome.studentId,
        ...(outcome.restored ? { restoredFromCancelled: true } : {}),
        ...(outcome.sameDay ? { sameDayOverride: outcome.sameDay } : {}),
        ...(outcome.diff.length ? { studentFieldsUpdated: outcome.diff } : {}),
        ...(paid ? { paid: true } : {}),
      },
    },
    ctx,
  );
  return { ok: true, bookingId: outcome.bookingId };
}

async function findBooking(id: number) {
  const [row] = await db
    .select({ booking: bookings, trip: activities })
    .from(bookings)
    .innerJoin(activities, eq(activities.id, bookings.activityId))
    .where(eq(bookings.id, id));
  return row ?? null;
}

/** Bookings outside the actor's scope answer "not found", like missing ones. */
async function loadEditable(actor: SessionUser, id: number) {
  const row = await findBooking(id);
  if (!row || !inScope(await bookingScope(actor, row.trip), row.booking)) return { error: "الحجز مش موجود" } as const;
  if (row.trip.status === "finished") return { error: "الرحلة انتهت" } as const;
  return row;
}

export async function confirmBooking(actor: SessionUser, id: number, ctx: RequestCtx): Promise<Result> {
  assertCan(actor, "confirm_bookings");
  const row = await loadEditable(actor, id);
  if ("error" in row) return fail(row.error!);
  const { booking, trip } = row;
  if (booking.status !== "pending") return fail("الحجز ده مش معلّق");
  if (booking.submittedData) return fail("الحجز عليه علامة «بيانات مختلفة». اختار البيانات الصح الأول");
  if (trip.paymentRequired && !booking.paidAt) return fail("الرحلة دي التأكيد فيها بعد الدفع، سجّل الدفع الأول");

  const updated = await db
    .update(bookings)
    .set({ status: "confirmed", handledBy: actor.id, handledAt: new Date() })
    .where(and(eq(bookings.id, id), eq(bookings.status, "pending")))
    .returning({ id: bookings.id });
  if (!updated.length) return fail("الحجز اتغيّر، حدّث الصفحة");
  await recordAudit(
    { actor: { type: "user", id: actor.id }, action: "booking.confirmed", subjectType: "booking", subjectId: id, meta: { activityId: trip.id } },
    ctx,
  );
  return { ok: true };
}

/** Moves the first waitlisted booking into the freed seat, as pending. */
async function promoteNext(tx: Tx, activityId: number) {
  const [next] = await tx
    .select({ id: bookings.id })
    .from(bookings)
    .where(and(eq(bookings.activityId, activityId), eq(bookings.status, "waitlisted")))
    .orderBy(asc(bookings.waitlistPosition), asc(bookings.id))
    .limit(1);
  if (!next) return null;
  await tx.update(bookings).set({ status: "pending", waitlistPosition: null }).where(eq(bookings.id, next.id));
  return next.id;
}

export async function cancelBooking(actor: SessionUser, id: number, ctx: RequestCtx): Promise<Result<{ promotedId: number | null }>> {
  assertCan(actor, "cancel_bookings");
  const row = await loadEditable(actor, id);
  if ("error" in row) return fail(row.error!);
  const { booking } = row;
  if (booking.status === "cancelled") return fail("الحجز ملغي بالفعل");

  const outcome = await db.transaction(async (tx) => {
    const trip = await lockTrip(tx, eq(activities.id, booking.activityId));
    const updated = await tx
      .update(bookings)
      // Dropping the secret revokes every QR code the student's phone can still show.
      .set({ status: "cancelled", waitlistPosition: null, busId: null, qrSecret: null, handledBy: actor.id, handledAt: new Date() })
      .where(and(eq(bookings.id, id), ne(bookings.status, "cancelled")))
      .returning({ id: bookings.id });
    if (!updated.length) return fail("الحجز اتغيّر، حدّث الصفحة");

    let promotedId: number | null = null;
    const freedSeat = OCCUPYING.includes(booking.status);
    if (freedSeat && trip && trip.whenFull === "waitlist" && trip.waitlistPromotion === "auto") {
      if ((await occupiedSeats(tx, trip.id)) < trip.capacity) promotedId = await promoteNext(tx, trip.id);
    }
    return { ok: true as const, promotedId };
  });
  if (!outcome.ok) return outcome;

  await recordAudit(
    {
      actor: { type: "user", id: actor.id },
      action: "booking.cancelled",
      subjectType: "booking",
      subjectId: id,
      meta: { activityId: booking.activityId, previousStatus: booking.status },
    },
    ctx,
  );
  if (outcome.promotedId) {
    await recordAudit(
      {
        actor: { type: "system" },
        action: "booking.promoted",
        subjectType: "booking",
        subjectId: outcome.promotedId,
        meta: { activityId: booking.activityId, auto: true, freedBy: id },
      },
      ctx,
    );
  }
  return outcome;
}

/** Manual waitlist promotion; the student moves to pending like any form booking. */
export async function promoteBooking(actor: SessionUser, id: number, ctx: RequestCtx): Promise<Result> {
  assertCan(actor, "confirm_bookings");
  const row = await loadEditable(actor, id);
  if ("error" in row) return fail(row.error!);
  if (row.booking.status !== "waitlisted") return fail("الحجز ده مش في قائمة الانتظار");

  const outcome = await db.transaction(async (tx) => {
    const trip = await lockTrip(tx, eq(activities.id, row.trip.id));
    if (!trip || (await occupiedSeats(tx, trip.id)) >= trip.capacity) return fail("مفيش أماكن فاضية في الرحلة");
    await tx.update(bookings).set({ status: "pending", waitlistPosition: null }).where(eq(bookings.id, id));
    return { ok: true as const };
  });
  if (!outcome.ok) return outcome;
  await recordAudit(
    { actor: { type: "user", id: actor.id }, action: "booking.promoted", subjectType: "booking", subjectId: id, meta: { activityId: row.trip.id } },
    ctx,
  );
  return { ok: true };
}

export async function setPayment(actor: SessionUser, id: number, paid: boolean, ctx: RequestCtx): Promise<Result> {
  assertCan(actor, "manage_activities");
  const row = await loadEditable(actor, id);
  if ("error" in row) return fail(row.error!);
  const { booking, trip } = row;
  if (!trip.feeEnabled) return fail("الاشتراك مش مفعّل في الرحلة دي");
  if (booking.status === "cancelled") return fail("الحجز ملغي");
  if (paid === Boolean(booking.paidAt)) return { ok: true };
  if (!paid && trip.paymentRequired && booking.status === "confirmed") {
    return fail("الحجز اتأكد على أساس الدفع. الغي الحجز لو الطالب مدفعش");
  }

  await db
    .update(bookings)
    .set(paid ? { paidAmount: trip.feeAmount, paidAt: new Date(), paymentRecordedBy: actor.id } : { paidAmount: null, paidAt: null, paymentRecordedBy: null })
    .where(eq(bookings.id, id));
  await recordAudit(
    {
      actor: { type: "user", id: actor.id },
      action: paid ? "booking.payment_recorded" : "booking.payment_removed",
      subjectType: "booking",
      subjectId: id,
      meta: { activityId: trip.id, amount: trip.feeAmount },
    },
    ctx,
  );
  return { ok: true };
}

/** Resolves a "different data" flag: apply the form's data to the student, or keep what's stored. */
export async function resolveSubmittedData(actor: SessionUser, id: number, choice: "apply" | "keep", ctx: RequestCtx): Promise<Result> {
  assertCan(actor, "manage_activities");
  const row = await loadEditable(actor, id);
  if ("error" in row) return fail(row.error!);
  const submitted = row.booking.submittedData;
  if (!submitted) return fail("مفيش بيانات مختلفة على الحجز ده");

  await db.transaction(async (tx) => {
    if (choice === "apply") await tx.update(students).set(submitted).where(eq(students.id, row.booking.studentId));
    await tx.update(bookings).set({ submittedData: null }).where(eq(bookings.id, id));
  });
  await recordAudit(
    {
      actor: { type: "user", id: actor.id },
      action: choice === "apply" ? "booking.data_applied" : "booking.data_kept",
      subjectType: "booking",
      subjectId: id,
      meta: { activityId: row.trip.id, studentId: row.booking.studentId, submitted },
    },
    ctx,
  );
  return { ok: true };
}

export async function setBookingOpen(actor: SessionUser, activityId: number, open: boolean, ctx: RequestCtx): Promise<Result> {
  assertCan(actor, "manage_activities");
  const [trip] = await db.select().from(activities).where(eq(activities.id, activityId));
  if (!trip) return fail("الرحلة مش موجودة");
  if (open && trip.status !== "upcoming") return fail("الحجز بيتفتح للرحلات القادمة بس");
  if (trip.bookingOpen === open) return { ok: true };

  await db.update(activities).set({ bookingOpen: open }).where(eq(activities.id, activityId));
  await recordAudit(
    { actor: { type: "user", id: actor.id }, action: open ? "activity.booking_opened" : "activity.booking_closed", subjectType: "activity", subjectId: activityId },
    ctx,
  );
  return { ok: true };
}

// ─── Queries ─────────────────────────────────────────────────────────────────

export const BOOKING_STATUS_LABELS: Record<BookingStatus, string> = {
  pending: "معلّق",
  confirmed: "مؤكد",
  cancelled: "ملغي",
  waitlisted: "قائمة انتظار",
};

export const BOOKINGS_PAGE_SIZE = 50;

export type BookingFilters = {
  status?: BookingStatus;
  q?: string;
  paid?: "paid" | "unpaid";
  flagged?: boolean;
  busId?: number | "none";
  page?: number;
  /** Supervisors' visibility limit; see src/lib/supervisors/scope.ts. */
  scope?: BookingScope;
  /** Digits match the national ID too; off for those who only see it masked. */
  searchNationalId?: boolean;
};

export async function listBookings(activityId: number, f: BookingFilters = {}) {
  const conditions: (SQL | undefined)[] = [eq(bookings.activityId, activityId), f.scope && scopeCondition(f.scope)];
  if (f.status) conditions.push(eq(bookings.status, f.status));
  if (f.paid === "paid") conditions.push(isNotNull(bookings.paidAt));
  if (f.paid === "unpaid") conditions.push(isNull(bookings.paidAt));
  if (f.flagged) conditions.push(isNotNull(bookings.submittedData));
  if (f.busId === "none") conditions.push(isNull(bookings.busId));
  else if (f.busId) conditions.push(eq(bookings.busId, f.busId));

  const q = toLatinDigits(f.q?.trim() ?? "").replace(/[%_\\]/g, "");
  if (q) {
    conditions.push(
      /^\d+$/.test(q)
        ? or(ilike(students.phone, `%${q}%`), f.searchNationalId === false ? undefined : ilike(students.nationalId, `%${q}%`))
        : ilike(students.name, `%${q.replace(/\s+/g, "%")}%`),
    );
  }

  const page = Math.max(1, f.page ?? 1);
  const rows = await db
    .select({
      booking: bookings,
      student: students,
      facultyName: faculties.name,
      busName: buses.name,
    })
    .from(bookings)
    .innerJoin(students, eq(students.id, bookings.studentId))
    .innerJoin(faculties, eq(faculties.id, students.facultyId))
    .leftJoin(buses, eq(buses.id, bookings.busId))
    .where(and(...conditions))
    .orderBy(
      // Waitlist in queue order, everything else newest first.
      sql`case when ${bookings.status} = 'waitlisted' then 1 else 0 end`,
      asc(bookings.waitlistPosition),
      desc(bookings.id),
    )
    .limit(BOOKINGS_PAGE_SIZE + 1)
    .offset((page - 1) * BOOKINGS_PAGE_SIZE);
  return { rows: rows.slice(0, BOOKINGS_PAGE_SIZE), hasNext: rows.length > BOOKINGS_PAGE_SIZE };
}

export async function bookingStats(trip: Activity) {
  const byStatus = await db
    .select({ status: bookings.status, n: count() })
    .from(bookings)
    .where(eq(bookings.activityId, trip.id))
    .groupBy(bookings.status);
  const counts: Record<BookingStatus, number> = { pending: 0, confirmed: 0, cancelled: 0, waitlisted: 0 };
  for (const r of byStatus) counts[r.status] = r.n;

  const [extra] = await db
    .select({
      flagged: sql<number>`count(*) filter (where ${bookings.submittedData} is not null)`.mapWith(Number),
      paid: sql<number>`count(*) filter (where ${bookings.paidAt} is not null and ${bookings.status} <> 'cancelled')`.mapWith(Number),
      collected: sum(sql`case when ${bookings.status} <> 'cancelled' then ${bookings.paidAmount} end`),
      unassigned: sql<number>`count(*) filter (where ${bookings.status} = 'confirmed' and ${bookings.busId} is null)`.mapWith(Number),
    })
    .from(bookings)
    .where(eq(bookings.activityId, trip.id));

  const occupied = counts.pending + counts.confirmed;
  return {
    ...counts,
    flagged: extra.flagged,
    paid: extra.paid,
    collected: Number(extra.collected ?? 0),
    unassigned: extra.unassigned,
    remaining: Math.max(0, trip.capacity - occupied),
    availability: availability(trip, occupied),
  };
}
