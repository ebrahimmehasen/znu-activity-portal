import { and, asc, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { activitySupervisors, buses, users } from "@/db/schema";
import { recordAudit, type RequestCtx } from "@/lib/audit";
import type { SessionUser } from "@/lib/auth/service";
import { can } from "@/lib/authz";
import { ForbiddenError } from "@/lib/errors";
import { getTrip } from "@/lib/trips/service";
import { assignment } from "./scope";

type Result = { ok: true } | { ok: false; error: string };

function assertCanManage(actor: SessionUser) {
  if (!can(actor, "manage_activities")) throw new ForbiddenError();
}

async function editableTrip(activityId: number) {
  const trip = await getTrip(activityId);
  if (!trip) return { error: "الرحلة مش موجودة" } as const;
  if (trip.status === "finished") return { error: "الرحلة انتهت" } as const;
  return { trip } as const;
}

export function listTripSupervisors(activityId: number) {
  return db
    .select({
      userId: users.id,
      name: users.name,
      username: users.username,
      isActive: users.isActive,
      busId: activitySupervisors.busId,
      busName: buses.name,
    })
    .from(activitySupervisors)
    .innerJoin(users, eq(users.id, activitySupervisors.userId))
    .leftJoin(buses, eq(buses.id, activitySupervisors.busId))
    .where(and(eq(activitySupervisors.activityId, activityId), isNull(users.deletedAt)))
    .orderBy(asc(users.name));
}

export async function assignSupervisor(actor: SessionUser, activityId: number, userId: number, ctx: RequestCtx): Promise<Result> {
  assertCanManage(actor);
  const check = await editableTrip(activityId);
  if ("error" in check) return { ok: false, error: check.error! };
  const [sup] = await db
    .select({ id: users.id, username: users.username })
    .from(users)
    .where(and(eq(users.id, userId), eq(users.role, "supervisor"), eq(users.isActive, true), isNull(users.deletedAt)));
  if (!sup) return { ok: false, error: "اختار مشرف" };

  const inserted = await db
    .insert(activitySupervisors)
    .values({ activityId, userId, assignedBy: actor.id })
    .onConflictDoNothing()
    .returning({ userId: activitySupervisors.userId });
  if (!inserted.length) return { ok: false, error: "المشرف ده مضاف على الرحلة بالفعل" };

  await recordAudit(
    { actor: { type: "user", id: actor.id }, action: "activity.supervisor_added", subjectType: "activity", subjectId: activityId, meta: { userId, username: sup.username } },
    ctx,
  );
  return { ok: true };
}

export async function unassignSupervisor(actor: SessionUser, activityId: number, userId: number, ctx: RequestCtx): Promise<Result> {
  assertCanManage(actor);
  const check = await editableTrip(activityId);
  if ("error" in check) return { ok: false, error: check.error! };

  const removed = await db
    .delete(activitySupervisors)
    .where(and(eq(activitySupervisors.activityId, activityId), eq(activitySupervisors.userId, userId)))
    .returning({ userId: activitySupervisors.userId });
  if (!removed.length) return { ok: false, error: "المشرف مش مضاف على الرحلة" };

  await recordAudit(
    { actor: { type: "user", id: actor.id }, action: "activity.supervisor_removed", subjectType: "activity", subjectId: activityId, meta: { userId } },
    ctx,
  );
  return { ok: true };
}

/** Several supervisors may share a bus; bus capacity only counts students. */
export async function setSupervisorBus(
  actor: SessionUser,
  activityId: number,
  userId: number,
  busId: number | null,
  ctx: RequestCtx,
): Promise<Result> {
  assertCanManage(actor);
  const check = await editableTrip(activityId);
  if ("error" in check) return { ok: false, error: check.error! };
  if (!check.trip.busesEnabled) return { ok: false, error: "الأتوبيسات مش مفعّلة في الرحلة دي" };
  const current = await assignment(userId, activityId);
  if (!current) return { ok: false, error: "المشرف مش مضاف على الرحلة" };
  if (current.busId === busId) return { ok: true };

  if (busId !== null) {
    const [bus] = await db
      .select({ id: buses.id })
      .from(buses)
      .where(and(eq(buses.id, busId), eq(buses.activityId, activityId)));
    if (!bus) return { ok: false, error: "الأتوبيس مش موجود" };
  }

  await db
    .update(activitySupervisors)
    .set({ busId })
    .where(and(eq(activitySupervisors.activityId, activityId), eq(activitySupervisors.userId, userId)));
  await recordAudit(
    {
      actor: { type: "user", id: actor.id },
      action: "activity.supervisor_bus_set",
      subjectType: "activity",
      subjectId: activityId,
      meta: { userId, from: current.busId, to: busId },
    },
    ctx,
  );
  return { ok: true };
}
