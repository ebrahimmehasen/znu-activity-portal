import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AutoRefresh } from "@/components/auto-refresh";
import { Badge, Card, PageHeader } from "@/components/ui";
import { tripDashboard, type CheckpointTally, type DashboardCell } from "@/lib/attendance/dashboard";
import { listSupervisorAttendance } from "@/lib/attendance/service";
import { can } from "@/lib/authz";
import { formatClock, formatDate } from "@/lib/dates";
import { YEAR_LABELS } from "@/lib/students/validation";
import { STATUS_LABELS, STATUS_TONES } from "@/lib/trips/labels";
import { requireVisibleTrip } from "@/lib/trips/access";

export const metadata: Metadata = { title: "داشبورد الرحلة" };

const CELL: Record<Exclude<DashboardCell, null>, { label: string; className: string }> = {
  present: { label: "حاضر", className: "bg-success/15 text-success" },
  late: { label: "متأخر", className: "bg-warning/15 text-warning" },
  pending: { label: "مستني", className: "bg-warning/10 text-warning" },
  absent: { label: "غياب", className: "bg-danger/15 text-danger" },
  unrecorded: { label: "لسه", className: "bg-background text-muted" },
};

const FILTERS = {
  all: "الكل",
  missing: "لسه محضروش",
  late: "المتأخرين",
  absent: "الغياب النهائي",
} as const;
type Filter = keyof typeof FILTERS;
const isFilter = (v: unknown): v is Filter => typeof v === "string" && v in FILTERS;

/** Present = on time + late; "still missing" also counts records waiting for confirmation as arrived. */
function TallyLine({ t, first }: { t: CheckpointTally; first: boolean }) {
  const arrived = t.present + t.late + t.pending;
  return (
    <div className="flex flex-wrap gap-x-3 gap-y-1 text-sm">
      <span className="text-success">حاضر {t.present}</span>
      <span className="text-warning">متأخر {t.late}</span>
      {t.pending > 0 && <span className="text-warning">مستني التأكيد {t.pending}</span>}
      <span className={t.unrecorded ? "font-semibold" : "text-muted"}>لسه {t.unrecorded}</span>
      {first && t.absent > 0 && <span className="text-danger">غياب {t.absent}</span>}
      <span className="text-muted">
        ({arrived} من {t.total})
      </span>
    </div>
  );
}

export default async function TripDashboardPage({ params, searchParams }: PageProps<"/dashboard/trips/[id]/dashboard">) {
  const { actor, trip } = await requireVisibleTrip((await params).id);
  if (!can(actor, "view_trip_dashboard")) notFound();
  const sp = await searchParams;
  const filter: Filter = isFilter(sp.show) ? sp.show : "all";

  const [d, staff] = await Promise.all([tripDashboard(actor, trip), listSupervisorAttendance(trip.id)]);
  const current = d.checkpoints.findLastIndex((c) => c.open);
  const focus = current >= 0 ? current : d.checkpoints.length - 1;
  const staffPresent = staff.filter((s) => s.recordedAt).length;

  const shown = d.rows.filter((r) => {
    if (filter === "absent") return r.finalAbsent;
    if (filter === "late") return r.cells.includes("late");
    if (filter === "missing") return focus >= 0 && r.cells[focus] === "unrecorded";
    return true;
  });

  return (
    <>
      <AutoRefresh seconds={30} />
      <PageHeader
        title={`داشبورد: ${trip.title}`}
        description={formatDate(trip.date)}
        actions={
          <div className="flex flex-wrap gap-2">
            {(can(actor, "take_attendance") || can(actor, "manage_activities") || can(actor, "manage_gatherings")) && trip.status !== "upcoming" && (
              <Link href={`/dashboard/trips/${trip.id}/attendance`} className="rounded-lg border border-border bg-surface px-4 py-2.5 text-sm font-semibold">
                الحضور والتجمعات
              </Link>
            )}
            <Link href={`/dashboard/trips/${trip.id}`} className="rounded-lg border border-border bg-surface px-4 py-2.5 text-sm font-semibold">
              الرحلة
            </Link>
          </div>
        }
      />

      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Card className="p-3">
            <div className="text-xs text-muted">الحالة</div>
            <div className="mt-1">
              <Badge tone={STATUS_TONES[trip.status]}>{STATUS_LABELS[trip.status]}</Badge>
            </div>
          </Card>
          <Card className="p-3">
            <div className="text-xs text-muted">{d.scopedToBus ? "طلبة أتوبيسك" : "الحجوزات المؤكدة"}</div>
            <div className="text-xl font-bold">{d.confirmed}</div>
          </Card>
          <Card className="p-3">
            <div className="text-xs text-muted">العدد الفعلي</div>
            <div className="text-xl font-bold">{trip.rosterLockedAt ? d.confirmed - d.finalAbsent : "—"}</div>
            {!trip.rosterLockedAt && <div className="text-xs text-muted">بعد تأكيد العدد</div>}
          </Card>
          <Card className="p-3">
            <div className="text-xs text-muted">المشرفين</div>
            <div className="text-xl font-bold">
              {staffPresent} <span className="text-sm font-normal text-muted">من {staff.length}</span>
            </div>
          </Card>
        </div>

        {d.checkpoints.length === 0 ? (
          <Card>
            <p className="text-sm text-muted">الرحلة لسه مبدأتش، فمفيش تجمعات. الإحصائيات هتظهر هنا أول ما الرحلة تبدأ.</p>
          </Card>
        ) : (
          <Card className="p-0">
            <h2 className="px-4 pt-4 font-semibold">التجمعات</h2>
            <ul className="divide-y divide-border">
              {d.checkpoints.map((cp, i) => (
                <li key={cp.id} className="space-y-2 px-4 py-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">{cp.name}</span>
                    {cp.scheduledAt && <span className="text-xs text-muted">{formatClock(cp.scheduledAt)}</span>}
                    {cp.open ? <Badge tone="success">مفتوح</Badge> : <Badge>{cp.openedAt ? "مقفول" : "لسه متفتحش"}</Badge>}
                  </div>
                  <TallyLine t={d.totals[i]} first={cp.sortOrder === 1} />
                  {d.groups.length > 0 && (
                    <div className="space-y-1 rounded-lg bg-background p-2">
                      {d.groups.map((g) => (
                        <div key={g.key} className="flex flex-wrap items-baseline gap-x-3">
                          <span className="w-28 shrink-0 text-xs font-semibold">
                            {g.label} ({g.count})
                          </span>
                          <TallyLine t={g.tallies[i]} first={cp.sortOrder === 1} />
                        </div>
                      ))}
                    </div>
                  )}
                </li>
              ))}
            </ul>
          </Card>
        )}

        <Card className="p-0">
          <div className="flex flex-wrap items-center justify-between gap-2 px-4 pt-4">
            <h2 className="font-semibold">الأسماء ({shown.length})</h2>
            <nav className="flex gap-1.5 overflow-x-auto" aria-label="فلتر">
              {(Object.keys(FILTERS) as Filter[]).map((f) => (
                <Link
                  key={f}
                  href={f === "all" ? "?" : `?show=${f}`}
                  aria-current={f === filter ? "page" : undefined}
                  className={`shrink-0 rounded-full border px-3 py-1 text-xs ${f === filter ? "border-primary bg-primary text-primary-foreground" : "border-border bg-surface"}`}
                >
                  {FILTERS[f]}
                </Link>
              ))}
            </nav>
          </div>
          {filter === "missing" && focus >= 0 && <p className="px-4 pt-2 text-xs text-muted">في {d.checkpoints[focus].name}</p>}
          {shown.length === 0 ? (
            <p className="p-4 text-sm text-muted">مفيش أسماء.</p>
          ) : (
            <ul className="mt-2 divide-y divide-border">
              {shown.map((r) => (
                <li key={r.bookingId} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
                  <div className="min-w-0">
                    <div className="font-medium">{r.name}</div>
                    <div className="mt-0.5 flex flex-wrap gap-x-3 text-xs text-muted">
                      <span>
                        {r.facultyName} · {YEAR_LABELS[r.year]}
                      </span>
                      {r.busName && <span>{r.busName}</span>}
                      <a href={`tel:${r.phone}`} className="ltr-nums text-primary" dir="ltr">
                        {r.phone}
                      </a>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {r.cells.map((c, i) =>
                      c === null ? null : (
                        <span key={d.checkpoints[i].id} title={d.checkpoints[i].name} className={`rounded-md px-2 py-0.5 text-xs font-medium ${CELL[c].className}`}>
                          {d.checkpoints.length > 1 && <span className="opacity-70">{i + 1}· </span>}
                          {CELL[c].label}
                        </span>
                      ),
                    )}
                    {r.finalAbsent && d.checkpoints.length > 1 && <span className="rounded-md bg-danger/10 px-2 py-0.5 text-xs text-danger">خارج الرحلة</span>}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </>
  );
}
