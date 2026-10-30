import { and, eq, exists, inArray, or, sql, type SQL } from "drizzle-orm";
import { db } from "@/db";
import { activities, activitySupervisors, bookings, type Activity, type Booking } from "@/db/schema";
import type { SessionUser } from "@/lib/auth/service";
import { can } from "@/lib/authz";
import { getSetting } from "@/lib/settings/service";

/**
 * What a supervisor may see (plan §8.5):
 * - trips: every trip, or only the ones they're assigned to (system setting);
 * - inside a trip with buses and "bus" scope: the students on their own bus, plus the
 *   pending / waitlisted requests when they may confirm or cancel (those have no bus yet).
 * Admins see everything. Rows outside the scope behave as if they don't exist.
 */

export async function assignment(userId: number, activityId: number) {
  const [row] = await db
    .select()
    .from(activitySupervisors)
    .where(and(eq(activitySupervisors.activityId, activityId), eq(activitySupervisors.userId, userId)));
  return row ?? null;
}

/** Condition on `activities` limiting a trip list to what the actor sees; undefined = no limit. */
export async function visibleTripsCondition(actor: SessionUser): Promise<SQL | undefined> {
  if (actor.role !== "supervisor") return undefined;
  if ((await getSetting("supervisor_trip_visibility")) === "all") return undefined;
  return exists(
    db
      .select({ one: sql`1` })
      .from(activitySupervisors)
      .where(and(eq(activitySupervisors.activityId, activities.id), eq(activitySupervisors.userId, actor.id))),
  );
}

export async function canViewTrip(actor: SessionUser, activityId: number) {
  if (actor.role !== "supervisor") return true;
  if ((await getSetting("supervisor_trip_visibility")) === "all") return true;
  return Boolean(await assignment(actor.id, activityId));
}

export type BookingScope =
  | { kind: "all" }
  | { kind: "none" }
  /** Limited to one bus (null: not placed on a bus yet); `requests` adds unassigned pending/waitlisted. */
  | { kind: "bus"; busId: number | null; requests: boolean };

export async function bookingScope(actor: SessionUser, trip: Activity): Promise<BookingScope> {
  if (actor.role !== "supervisor") return { kind: "all" };
  if (!(await canViewTrip(actor, trip.id))) return { kind: "none" };
  if (!trip.busesEnabled || trip.supervisorScope === "all") return { kind: "all" };
  const a = await assignment(actor.id, trip.id);
  return { kind: "bus", busId: a?.busId ?? null, requests: can(actor, "confirm_bookings") || can(actor, "cancel_bookings") };
}

export function scopeCondition(scope: BookingScope): SQL | undefined {
  if (scope.kind === "all") return undefined;
  if (scope.kind === "none") return sql`false`;
  const parts: SQL[] = [];
  if (scope.busId !== null) parts.push(eq(bookings.busId, scope.busId));
  if (scope.requests) parts.push(inArray(bookings.status, ["pending", "waitlisted"]));
  return parts.length ? or(...parts) : sql`false`;
}

export function inScope(scope: BookingScope, booking: Pick<Booking, "busId" | "status">) {
  if (scope.kind === "all") return true;
  if (scope.kind === "none") return false;
  if (scope.busId !== null && booking.busId === scope.busId) return true;
  return scope.requests && (booking.status === "pending" || booking.status === "waitlisted");
}
