import type { Activity } from "@/db/schema";
import { tripDashboard, type DashboardCell } from "@/lib/attendance/dashboard";
import type { SessionUser } from "@/lib/auth/service";
import { can } from "@/lib/authz";
import { bookingStats } from "@/lib/bookings/service";
import { formatClock, formatDate, formatTime } from "@/lib/dates";
import { ForbiddenError } from "@/lib/errors";
import type { Locale } from "@/i18n/config";
import { makeT } from "@/i18n/translate";
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
  pending: "بانتظار التأكيد",
  absent: "غائب",
  unrecorded: "لم يحضر",
};

export async function tripReport(actor: SessionUser, trip: Activity, locale: Locale = "ar") {
  if (!can(actor, "manage_activities")) throw new ForbiddenError();
  const [d, stats] = await Promise.all([tripDashboard(actor, trip), bookingStats(trip)]);
  const first = d.totals[0];
  const t = makeT(locale);

  // "Actually there": the fixed roster once confirmed, else whoever has arrived so far.
  const actual = trip.rosterLockedAt ? d.confirmed - d.finalAbsent : first ? first.present + first.late + first.pending : null;

  const summary: [string, string | number][] = [
    [t("الرحلة"), trip.title],
    [t("التاريخ"), formatDate(trip.date, locale)],
    [t("المواعيد"), [formatTime(trip.startTime, locale), formatTime(trip.endTime, locale)].filter(Boolean).join(" – ") || "—"],
    [t("المكان"), trip.location || "—"],
    [t("الحالة"), t(STATUS_LABELS[trip.status])],
    [t("إجمالي الطلبات"), stats.pending + stats.confirmed + stats.waitlisted + stats.cancelled],
    [t("المؤكدة"), stats.confirmed],
    [t("المعلّقة"), stats.pending],
    ...(stats.waitlisted ? ([[t("قائمة الانتظار"), stats.waitlisted]] as [string, number][]) : []),
    [t("الملغاة"), stats.cancelled],
    [t("الحاضرون فعليًا"), actual ?? "—"],
    [t("الغائبون"), trip.rosterLockedAt ? d.finalAbsent : first ? first.absent : "—"],
    ...(trip.feeEnabled ? ([[t("الدفع"), t("{n} ({amount} جنيه)", { n: stats.paid, amount: stats.collected })]] as [string, string][]) : []),
  ];

  const checkpoints = d.checkpoints.map((cp, i) => ({
    name: cp.name,
    time: cp.scheduledAt ? formatClock(cp.scheduledAt, locale) : "",
    first: cp.sortOrder === 1,
    tally: d.totals[i],
  }));

  const rows = d.rows.map((r, n) => ({
    n: n + 1,
    name: r.name,
    faculty: r.facultyName,
    year: t(YEAR_LABELS[r.year]),
    phone: r.phone,
    bus: r.busName ?? "",
    paid: r.paidAt ? t("دفع") : t("لم يدفع"),
    cells: r.cells.map((c, i) => (c === null ? "—" : r.times[i] ? `${t(CELL_LABELS[c])} ${formatClock(r.times[i], locale)}` : t(CELL_LABELS[c]))),
  }));

  return { trip, locale, summary, checkpoints, rows, showBus: trip.busesEnabled, showPaid: trip.feeEnabled };
}

export type TripReport = Awaited<ReturnType<typeof tripReport>>;
