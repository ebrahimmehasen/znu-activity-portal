import { and, asc, count, eq, inArray, isNull, ne, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { bookings, buses, students } from "@/db/schema";
import { recordAudit, type RequestCtx } from "@/lib/audit";
import type { SessionUser } from "@/lib/auth/service";
import { can } from "@/lib/authz";
import { ForbiddenError } from "@/lib/errors";
import { getTrip } from "@/lib/trips/service";

export const busInputSchema = z.object({
  name: z.string().trim().min(1, "أدخل اسم الحافلة").max(100),
  capacity: z.coerce.number().int("يجب أن يكون العدد رقمًا صحيحًا").min(1, "السعة من 1 إلى 200").max(200, "السعة من 1 إلى 200"),
});

type Result = { ok: true } | { ok: false; error: string };

function assertCanManage(actor: SessionUser) {
  if (!can(actor, "manage_activities")) throw new ForbiddenError();
}

async function editableTrip(activityId: number) {
  const trip = await getTrip(activityId);
  if (!trip) return { error: "الرحلة غير موجودة" } as const;
  if (!trip.busesEnabled) return { error: "الحافلات غير مفعَّلة في هذه الرحلة" } as const;
  if (trip.status === "finished") return { error: "انتهت الرحلة" } as const;
  return { trip } as const;
}

async function nameTaken(activityId: number, name: string, exceptId?: number) {
  const [row] = await db
    .select({ id: buses.id })
    .from(buses)
    .where(and(eq(buses.activityId, activityId), sql`lower(${buses.name}) = lower(${name})`, exceptId ? ne(buses.id, exceptId) : undefined));
  return Boolean(row);
}

export function listBuses(activityId: number) {
  return db.select().from(buses).where(eq(buses.activityId, activityId)).orderBy(asc(buses.id));
}

export async function createBus(actor: SessionUser, activityId: number, input: z.input<typeof busInputSchema>, ctx: RequestCtx): Promise<Result> {
  assertCanManage(actor);
  const check = await editableTrip(activityId);
  if ("error" in check) return { ok: false, error: check.error! };
  const parsed = busInputSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };
  if (await nameTaken(activityId, parsed.data.name)) return { ok: false, error: "توجد حافلة بالاسم نفسه" };

  const [bus] = await db.insert(buses).values({ activityId, ...parsed.data }).returning({ id: buses.id });
  await recordAudit(
    { actor: { type: "user", id: actor.id }, action: "bus.created", subjectType: "bus", subjectId: bus.id, meta: { activityId, ...parsed.data } },
    ctx,
  );
  return { ok: true };
}

async function findBus(id: number) {
  const [bus] = await db.select().from(buses).where(eq(buses.id, id));
  return bus ?? null;
}

export async function updateBus(actor: SessionUser, id: number, input: z.input<typeof busInputSchema>, ctx: RequestCtx): Promise<Result> {
  assertCanManage(actor);
  const bus = await findBus(id);
  if (!bus) return { ok: false, error: "الحافلة غير موجودة" };
  const check = await editableTrip(bus.activityId);
  if ("error" in check) return { ok: false, error: check.error! };
  const parsed = busInputSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };
  if (await nameTaken(bus.activityId, parsed.data.name, id)) return { ok: false, error: "توجد حافلة بالاسم نفسه" };

  await db.update(buses).set(parsed.data).where(eq(buses.id, id));
  await recordAudit(
    {
      actor: { type: "user", id: actor.id },
      action: "bus.updated",
      subjectType: "bus",
      subjectId: id,
      meta: { activityId: bus.activityId, before: { name: bus.name, capacity: bus.capacity }, after: parsed.data },
    },
    ctx,
  );
  return { ok: true };
}

export async function deleteBus(actor: SessionUser, id: number, ctx: RequestCtx): Promise<Result> {
  assertCanManage(actor);
  const bus = await findBus(id);
  if (!bus) return { ok: false, error: "الحافلة غير موجودة" };
  const check = await editableTrip(bus.activityId);
  if ("error" in check) return { ok: false, error: check.error! };

  await db.delete(buses).where(eq(buses.id, id));
  await recordAudit(
    { actor: { type: "user", id: actor.id }, action: "bus.deleted", subjectType: "bus", subjectId: id, meta: { activityId: bus.activityId, name: bus.name } },
    ctx,
  );
  return { ok: true };
}

// ─── Student distribution ────────────────────────────────────────────────────

async function busLoad(activityId: number) {
  const rows = await db
    .select({ id: buses.id, name: buses.name, capacity: buses.capacity, used: count(bookings.id) })
    .from(buses)
    .leftJoin(bookings, and(eq(bookings.busId, buses.id), eq(bookings.status, "confirmed")))
    .where(eq(buses.activityId, activityId))
    .groupBy(buses.id)
    .orderBy(asc(buses.id));
  return rows;
}

export { busLoad as listBusLoad };

/** Puts one confirmed student on a bus (or takes them off with `busId = null`). */
export async function assignBus(actor: SessionUser, bookingId: number, busId: number | null, ctx: RequestCtx): Promise<Result> {
  assertCanManage(actor);
  const [booking] = await db.select().from(bookings).where(eq(bookings.id, bookingId));
  if (!booking) return { ok: false, error: "الحجز غير موجود" };
  const check = await editableTrip(booking.activityId);
  if ("error" in check) return { ok: false, error: check.error! };
  if (booking.status !== "confirmed") return { ok: false, error: "التوزيع على الحافلات للحجوزات المؤكدة فقط" };
  if (booking.busId === busId) return { ok: true };

  if (busId !== null) {
    const bus = (await busLoad(booking.activityId)).find((b) => b.id === busId);
    if (!bus) return { ok: false, error: "الحافلة غير موجودة" };
    if (bus.used >= bus.capacity) return { ok: false, error: `${bus.name} ممتلئة` };
  }

  await db.update(bookings).set({ busId }).where(eq(bookings.id, bookingId));
  await recordAudit(
    {
      actor: { type: "user", id: actor.id },
      action: "booking.bus_assigned",
      subjectType: "booking",
      subjectId: bookingId,
      meta: { activityId: booking.activityId, from: booking.busId, to: busId },
    },
    ctx,
  );
  return { ok: true };
}

/**
 * Fills the free seats with confirmed students who have no bus yet, in bus order.
 * Students are grouped by faculty and year so classmates tend to ride together.
 */
export async function autoAssignBuses(
  actor: SessionUser,
  activityId: number,
  ctx: RequestCtx,
): Promise<{ ok: true; assigned: number; left: number } | { ok: false; error: string }> {
  assertCanManage(actor);
  const check = await editableTrip(activityId);
  if ("error" in check) return { ok: false, error: check.error! };

  const loads = await busLoad(activityId);
  if (!loads.length) return { ok: false, error: "أضف الحافلات أولًا" };
  const waiting = await db
    .select({ id: bookings.id })
    .from(bookings)
    .innerJoin(students, eq(students.id, bookings.studentId))
    .where(and(eq(bookings.activityId, activityId), eq(bookings.status, "confirmed"), isNull(bookings.busId)))
    .orderBy(asc(students.facultyId), asc(students.year), asc(bookings.id));

  let next = 0;
  const plan: { busId: number; ids: number[] }[] = [];
  for (const bus of loads) {
    const free = Math.max(0, bus.capacity - bus.used);
    const ids = waiting.slice(next, next + free).map((w) => w.id);
    next += ids.length;
    if (ids.length) plan.push({ busId: bus.id, ids });
  }

  if (plan.length) {
    await db.transaction(async (tx) => {
      for (const p of plan) {
        await tx
          .update(bookings)
          .set({ busId: p.busId })
          .where(and(inArray(bookings.id, p.ids), isNull(bookings.busId)));
      }
    });
  }
  await recordAudit(
    {
      actor: { type: "user", id: actor.id },
      action: "bus.auto_assigned",
      subjectType: "activity",
      subjectId: activityId,
      meta: { assigned: next, left: waiting.length - next },
    },
    ctx,
  );
  return { ok: true, assigned: next, left: waiting.length - next };
}
