import { and, asc, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { attendances, bookings, buses, faculties, students, type Activity, type Attendance } from "@/db/schema";
import type { SessionUser } from "@/lib/auth/service";
import { can } from "@/lib/authz";
import { ForbiddenError } from "@/lib/errors";
import { bookingScope, scopeCondition } from "@/lib/supervisors/scope";
import { activeRecord, isOpen, listCheckpoints, rowState, tallies, type RowState } from "./service";

/**
 * The trip dashboard (plan §6.1): every student on the trip with their state at each
 * gathering, and per gathering how many are present / late / still missing — for the
 * whole trip and per bus. A bus-scoped supervisor sees their own bus only.
 * A cell is null where the student isn't on that gathering's roster (final absentees
 * after the first gathering).
 */

export type DashboardCell = RowState | null;
export type CheckpointTally = ReturnType<typeof tallies>;

export async function tripDashboard(actor: SessionUser, trip: Activity) {
  if (!can(actor, "view_trip_dashboard")) throw new ForbiddenError();
  const scope = await bookingScope(actor, trip);

  const [cps, roster, tripBuses] = await Promise.all([
    listCheckpoints(trip.id),
    db
      .select({
        bookingId: bookings.id,
        name: students.name,
        phone: students.phone,
        year: students.year,
        facultyName: faculties.name,
        busId: bookings.busId,
        paidAt: bookings.paidAt,
      })
      .from(bookings)
      .innerJoin(students, eq(students.id, bookings.studentId))
      .innerJoin(faculties, eq(faculties.id, students.facultyId))
      .where(and(eq(bookings.activityId, trip.id), eq(bookings.status, "confirmed"), scopeCondition(scope)))
      .orderBy(asc(students.name)),
    trip.busesEnabled ? db.select().from(buses).where(eq(buses.activityId, trip.id)).orderBy(asc(buses.id)) : Promise.resolve([]),
  ]);

  const records: Attendance[] =
    cps.length && roster.length
      ? await db
          .select()
          .from(attendances)
          .where(and(inArray(attendances.checkpointId, cps.map((c) => c.id)), activeRecord()))
      : [];
  const byKey = new Map(records.map((r) => [`${r.checkpointId}:${r.bookingId}`, r]));
  const first = cps.find((c) => c.sortOrder === 1);
  const busName = new Map(tripBuses.map((b) => [b.id, b.name]));

  const rows = roster.map((s) => {
    const finalAbsent = first ? byKey.get(`${first.id}:${s.bookingId}`)?.status === "absent" : false;
    const recs = cps.map((cp) => (cp.sortOrder > 1 && finalAbsent ? undefined : (byKey.get(`${cp.id}:${s.bookingId}`) ?? null)));
    const cells: DashboardCell[] = recs.map((r) => (r === undefined ? null : rowState(r)));
    // When each one was scanned or marked (null: no record, or marked absent).
    const times = recs.map((r) => (r && r.status !== "absent" ? r.recordedAt : null));
    return { ...s, busName: s.busId ? (busName.get(s.busId) ?? null) : null, finalAbsent, cells, times };
  });

  const tally = (subset: typeof rows): CheckpointTally[] =>
    cps.map((_, i) => tallies(subset.flatMap((r) => (r.cells[i] ? [{ state: r.cells[i] }] : []))));

  // Per bus only when there is more than one group to compare.
  const groups =
    trip.busesEnabled && scope.kind === "all"
      ? [
          ...tripBuses.map((b) => ({ key: `bus-${b.id}`, label: b.name, rows: rows.filter((r) => r.busId === b.id) })),
          { key: "no-bus", label: "من غير أتوبيس", rows: rows.filter((r) => r.busId === null) },
        ].filter((g) => g.rows.length > 0)
      : [];

  return {
    checkpoints: cps.map((cp) => ({ ...cp, open: isOpen(cp) && !(cp.sortOrder === 1 && trip.rosterLockedAt) })),
    rows,
    confirmed: rows.length,
    finalAbsent: rows.filter((r) => r.finalAbsent).length,
    totals: tally(rows),
    groups: groups.map((g) => ({ key: g.key, label: g.label, count: g.rows.length, tallies: tally(g.rows) })),
    scopedToBus: scope.kind === "bus",
  };
}
