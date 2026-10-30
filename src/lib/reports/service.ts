import type { Activity } from "@/db/schema";
import { tripDashboard, type DashboardCell } from "@/lib/attendance/dashboard";
import type { SessionUser } from "@/lib/auth/service";
import { can } from "@/lib/authz";
import { bookingStats } from "@/lib/bookings/service";
import { formatClock, formatDate, formatTime } from "@/lib/dates";
import { ForbiddenError } from "@/lib/errors";
import { YEAR_LABELS } from "@/lib/students/validation";
import { STATUS_LABELS } from "@/lib/trips/labels";

/**
 * The trip report (plan §8): the full roster with every gathering's state, and a summary
 * of booked / confirmed / actually there / absent / late per gathering. Feeds the Excel
 * file and the printable page (saved as PDF from the browser). Admins only: it lists
 * every student's phone.
 */

export const CELL_LABELS: Record<Exclude<DashboardCell, null>, string> = {
  present: "حاضر",
  late: "متأخر",
  pending: "مستني التأكيد",
  absent: "غياب",
  unrecorded: "لم يحضر",
};

export async function tripReport(actor: SessionUser, trip: Activity) {
  if (!can(actor, "manage_activities")) throw new ForbiddenError();
  const [d, stats] = await Promise.all([tripDashboard(actor, trip), bookingStats(trip)]);
  const first = d.totals[0];

  // "Actually there": the fixed roster once confirmed, else whoever has arrived so far.
  const actual = trip.rosterLockedAt ? d.confirmed - d.finalAbsent : first ? first.present + first.late + first.pending : null;

  const summary: [string, string | number][] = [
    ["الرحلة", trip.title],
    ["التاريخ", formatDate(trip.date)],
    ["المواعيد", [formatTime(trip.startTime), formatTime(trip.endTime)].filter(Boolean).join(" – ") || "—"],
    ["المكان", trip.location || "—"],
    ["الحالة", STATUS_LABELS[trip.status]],
    ["إجمالي الطلبات", stats.pending + stats.confirmed + stats.waitlisted + stats.cancelled],
    ["المؤكد", stats.confirmed],
    ["المعلّق", stats.pending],
    ...(stats.waitlisted ? ([["قائمة الانتظار", stats.waitlisted]] as [string, number][]) : []),
    ["الملغي", stats.cancelled],
    ["الحاضر فعليًا", actual ?? "—"],
    ["الغياب", trip.rosterLockedAt ? d.finalAbsent : first ? first.absent : "—"],
    ...(trip.feeEnabled ? ([["دفع", `${stats.paid} (${stats.collected} جنيه)`]] as [string, string][]) : []),
  ];

  const checkpoints = d.checkpoints.map((cp, i) => ({
    name: cp.name,
    time: cp.scheduledAt ? formatClock(cp.scheduledAt) : "",
    first: cp.sortOrder === 1,
    tally: d.totals[i],
  }));

  const rows = d.rows.map((r, n) => ({
    n: n + 1,
    name: r.name,
    faculty: r.facultyName,
    year: YEAR_LABELS[r.year],
    phone: r.phone,
    bus: r.busName ?? "",
    paid: r.paidAt ? "دفع" : "لم يدفع",
    cells: r.cells.map((c, i) => (c === null ? "—" : r.times[i] ? `${CELL_LABELS[c]} ${formatClock(r.times[i])}` : CELL_LABELS[c])),
  }));

  return { trip, summary, checkpoints, rows, showBus: trip.busesEnabled, showPaid: trip.feeEnabled };
}

export type TripReport = Awaited<ReturnType<typeof tripReport>>;
