import { and, asc, eq, ne, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { buses } from "@/db/schema";
import { recordAudit, type RequestCtx } from "@/lib/audit";
import type { SessionUser } from "@/lib/auth/service";
import { can } from "@/lib/authz";
import { ForbiddenError } from "@/lib/errors";
import { getTrip } from "@/lib/trips/service";

export const busInputSchema = z.object({
  name: z.string().trim().min(1, "اكتب اسم الأتوبيس").max(100),
  capacity: z.coerce.number().int("العدد لازم يكون رقم صحيح").min(1, "السعة من 1 لـ 200").max(200, "السعة من 1 لـ 200"),
});

type Result = { ok: true } | { ok: false; error: string };

function assertCanManage(actor: SessionUser) {
  if (!can(actor, "manage_activities")) throw new ForbiddenError();
}

async function editableTrip(activityId: number) {
  const trip = await getTrip(activityId);
  if (!trip) return { error: "الرحلة مش موجودة" } as const;
  if (!trip.busesEnabled) return { error: "الأتوبيسات مش مفعّلة في الرحلة دي" } as const;
  if (trip.status === "finished") return { error: "الرحلة انتهت" } as const;
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
  if (await nameTaken(activityId, parsed.data.name)) return { ok: false, error: "فيه أتوبيس بنفس الاسم" };

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
  if (!bus) return { ok: false, error: "الأتوبيس مش موجود" };
  const check = await editableTrip(bus.activityId);
  if ("error" in check) return { ok: false, error: check.error! };
  const parsed = busInputSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };
  if (await nameTaken(bus.activityId, parsed.data.name, id)) return { ok: false, error: "فيه أتوبيس بنفس الاسم" };

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
  if (!bus) return { ok: false, error: "الأتوبيس مش موجود" };
  const check = await editableTrip(bus.activityId);
  if ("error" in check) return { ok: false, error: check.error! };

  await db.delete(buses).where(eq(buses.id, id));
  await recordAudit(
    { actor: { type: "user", id: actor.id }, action: "bus.deleted", subjectType: "bus", subjectId: id, meta: { activityId: bus.activityId, name: bus.name } },
    ctx,
  );
  return { ok: true };
}
