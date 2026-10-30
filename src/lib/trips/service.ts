import { randomBytes } from "node:crypto";
import { and, asc, count, desc, eq, inArray, type SQL } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { activities, activityScheduleItems, bookings, buses, type ActivityStatus } from "@/db/schema";
import { recordAudit, type RequestCtx } from "@/lib/audit";
import type { SessionUser } from "@/lib/auth/service";
import { can } from "@/lib/authz";
import { cairoToday, isValidIsoDate } from "@/lib/dates";
import { ForbiddenError } from "@/lib/errors";

const timeSchema = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "ميعاد غير صحيح");
const optionalTime = z
  .union([z.literal(""), z.null(), timeSchema])
  .optional()
  .transform((v) => v || null);
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullish()
    .transform((v) => v || null);

export const scheduleItemSchema = z.object({
  time: optionalTime,
  title: z.string().trim().min(1, "اكتب عنوان البند").max(200),
  notes: optionalText(1000),
});

export const tripInputSchema = z
  .object({
    title: z.string().trim().min(3, "العنوان لازم يكون 3 حروف على الأقل").max(200),
    description: optionalText(5000),
    date: z.string().refine(isValidIsoDate, "تاريخ غير صحيح"),
    startTime: optionalTime,
    endTime: optionalTime,
    location: optionalText(255),
    capacity: z.coerce.number().int("العدد لازم يكون رقم صحيح").min(1, "العدد لازم يكون 1 على الأقل").max(10000),
    whenFull: z.enum(["close", "waitlist"]),
    waitlistPromotion: z.enum(["auto", "manual"]),
    feeEnabled: z.boolean(),
    feeAmount: z.union([z.literal(""), z.null(), z.coerce.number()]).optional(),
    paymentRequired: z.boolean(),
    lateGraceMinutes: z.coerce.number().int().min(0, "فترة السماح من 0 لـ 240 دقيقة").max(240, "فترة السماح من 0 لـ 240 دقيقة"),
    busesEnabled: z.boolean(),
    supervisorScope: z.enum(["bus", "all"]),
    schedule: z.array(scheduleItemSchema).max(50, "أقصى عدد 50 بند"),
  })
  .superRefine((d, ctx) => {
    if (d.feeEnabled) {
      const amount = typeof d.feeAmount === "number" ? d.feeAmount : NaN;
      if (!(amount > 0 && amount <= 100000)) ctx.addIssue({ code: "custom", path: ["feeAmount"], message: "اكتب مبلغ الاشتراك" });
    }
  })
  .transform((d) => ({
    ...d,
    // Options that only make sense with their parent switch are normalized away.
    feeAmount: d.feeEnabled && typeof d.feeAmount === "number" ? d.feeAmount.toFixed(2) : null,
    paymentRequired: d.feeEnabled ? d.paymentRequired : false,
  }));

export type TripInput = z.input<typeof tripInputSchema>;

type Result<T = object> = ({ ok: true } & T) | { ok: false; errors: Record<string, string> };

function assertCanManage(actor: SessionUser) {
  if (!can(actor, "manage_activities")) throw new ForbiddenError();
}

function zodErrors(error: z.ZodError) {
  const errors: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = String(issue.path[0] ?? "_");
    errors[key] ??= issue.message;
  }
  return errors;
}

function scheduleRows(activityId: number, items: z.output<typeof scheduleItemSchema>[]) {
  return items.map((item, i) => ({ activityId, ...item, sortOrder: i + 1 }));
}

export async function createTrip(actor: SessionUser, input: TripInput, ctx: RequestCtx): Promise<Result<{ id: number }>> {
  assertCanManage(actor);
  const parsed = tripInputSchema.safeParse(input);
  if (!parsed.success) return { ok: false, errors: zodErrors(parsed.error) };
  const { schedule, ...data } = parsed.data;
  if (data.date < cairoToday()) return { ok: false, errors: { date: "التاريخ ده عدّى" } };

  const id = await db.transaction(async (tx) => {
    const [trip] = await tx
      .insert(activities)
      .values({ ...data, type: "trip", publicToken: randomBytes(16).toString("base64url"), createdBy: actor.id })
      .returning({ id: activities.id });
    if (schedule.length) await tx.insert(activityScheduleItems).values(scheduleRows(trip.id, schedule));
    return trip.id;
  });

  await recordAudit(
    { actor: { type: "user", id: actor.id }, action: "activity.created", subjectType: "activity", subjectId: id, meta: { title: data.title, date: data.date } },
    ctx,
  );
  return { ok: true, id };
}

export async function updateTrip(actor: SessionUser, id: number, input: TripInput, ctx: RequestCtx): Promise<Result> {
  assertCanManage(actor);
  const current = await getTrip(id);
  if (!current) return { ok: false, errors: { _: "الرحلة مش موجودة" } };
  if (current.status === "finished") return { ok: false, errors: { _: "الرحلة انتهت ومينفعش تتعدّل" } };

  const parsed = tripInputSchema.safeParse(input);
  if (!parsed.success) return { ok: false, errors: zodErrors(parsed.error) };
  const { schedule, ...data } = parsed.data;

  if (data.date !== current.date) {
    if (current.status === "ongoing") return { ok: false, errors: { date: "مينفعش تغيّر تاريخ رحلة بدأت" } };
    if (data.date < cairoToday()) return { ok: false, errors: { date: "التاريخ ده عدّى" } };
  }

  const held = await heldSeats(id);
  if (data.capacity < held) return { ok: false, errors: { capacity: `فيه ${held} حجز معلّق أو مؤكد، العدد مينفعش يقل عن كده` } };

  // Postgres returns times as HH:MM:SS while input is HH:MM.
  const norm = (v: unknown) => (v == null ? "" : String(v).replace(/^(\d\d:\d\d):00$/, "$1"));
  const changed = Object.keys(data).filter((k) => norm(current[k as keyof typeof current]) !== norm(data[k as keyof typeof data]));

  await db.transaction(async (tx) => {
    await tx.update(activities).set(data).where(eq(activities.id, id));
    await tx.delete(activityScheduleItems).where(eq(activityScheduleItems.activityId, id));
    if (schedule.length) await tx.insert(activityScheduleItems).values(scheduleRows(id, schedule));
  });

  await recordAudit(
    { actor: { type: "user", id: actor.id }, action: "activity.updated", subjectType: "activity", subjectId: id, meta: { fields: changed } },
    ctx,
  );
  return { ok: true };
}

/** Only upcoming trips can be deleted; ongoing/finished trips hold attendance history. */
export async function deleteTrip(actor: SessionUser, id: number, ctx: RequestCtx): Promise<Result> {
  assertCanManage(actor);
  const current = await getTrip(id);
  if (!current) return { ok: false, errors: { _: "الرحلة مش موجودة" } };
  if (current.status !== "upcoming") return { ok: false, errors: { _: "مينفعش تحذف رحلة بدأت أو انتهت" } };
  if (await heldSeats(id)) return { ok: false, errors: { _: "الرحلة فيها حجوزات معلّقة أو مؤكدة. الغيها الأول قبل الحذف" } };

  await db.delete(activities).where(eq(activities.id, id));
  await recordAudit(
    { actor: { type: "user", id: actor.id }, action: "activity.deleted", subjectType: "activity", subjectId: id, meta: { title: current.title, date: current.date } },
    ctx,
  );
  return { ok: true };
}

async function heldSeats(activityId: number) {
  const [row] = await db
    .select({ n: count() })
    .from(bookings)
    .where(and(eq(bookings.activityId, activityId), inArray(bookings.status, ["pending", "confirmed"])));
  return row.n;
}

export async function getTrip(id: number) {
  const [trip] = await db
    .select()
    .from(activities)
    .where(and(eq(activities.id, id), eq(activities.type, "trip")));
  return trip ?? null;
}

export function getSchedule(activityId: number) {
  return db
    .select()
    .from(activityScheduleItems)
    .where(eq(activityScheduleItems.activityId, activityId))
    .orderBy(asc(activityScheduleItems.sortOrder));
}

/** `visible` narrows the list to what the actor may see (src/lib/supervisors/scope.ts). */
export async function listTrips(status: ActivityStatus, visible?: SQL) {
  const order = status === "finished" ? [desc(activities.date), desc(activities.id)] : [asc(activities.date), asc(activities.startTime)];
  return db
    .select({
      id: activities.id,
      title: activities.title,
      date: activities.date,
      startTime: activities.startTime,
      location: activities.location,
      capacity: activities.capacity,
      busesEnabled: activities.busesEnabled,
      busCount: count(buses.id),
    })
    .from(activities)
    .leftJoin(buses, eq(buses.activityId, activities.id))
    .where(and(eq(activities.type, "trip"), eq(activities.status, status), visible))
    .groupBy(activities.id)
    .orderBy(...order);
}

export async function countTripsByStatus(visible?: SQL) {
  const rows = await db
    .select({ status: activities.status, n: count() })
    .from(activities)
    .where(and(eq(activities.type, "trip"), visible))
    .groupBy(activities.status);
  const result: Record<ActivityStatus, number> = { upcoming: 0, ongoing: 0, finished: 0 };
  for (const r of rows) result[r.status] = r.n;
  return result;
}
