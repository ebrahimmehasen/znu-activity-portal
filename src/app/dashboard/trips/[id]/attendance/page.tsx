import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ActionButton } from "@/components/action-button";
import { Badge, Card, PageHeader } from "@/components/ui";
import {
  checkpointRoster,
  finalAbsentees,
  isOpen,
  listCheckpoints,
  listSupervisorAttendance,
  rejectedRecords,
  tallies,
  type RowState,
} from "@/lib/attendance/service";
import { can } from "@/lib/authz";
import { formatClock, formatDate } from "@/lib/dates";
import { getSetting } from "@/lib/settings/service";
import { YEAR_LABELS } from "@/lib/students/validation";
import { bookingScope } from "@/lib/supervisors/scope";
import { requireVisibleTrip } from "@/lib/trips/access";
import { attendanceAction } from "./actions";
import { AddCheckpointForm } from "./forms";
import { TripRunButtons } from "./trip-run";

export const metadata: Metadata = { title: "الحضور" };

const STATE_LABELS: Record<RowState, string> = {
  present: "حاضر",
  late: "متأخر",
  absent: "غياب",
  pending: "مستني التأكيد",
  unrecorded: "لم يُسجَّل بعد",
};
const STATE_TONES: Record<RowState, "neutral" | "success" | "danger" | "warning"> = {
  present: "success",
  late: "warning",
  absent: "danger",
  pending: "warning",
  unrecorded: "neutral",
};
const ORDER: RowState[] = ["unrecorded", "pending", "late", "present", "absent"];

const small = "px-3 py-1.5 text-xs";

function Stat({ label, value, tone }: { label: string; value: number; tone?: string }) {
  return (
    <div className="rounded-xl border border-border bg-surface px-3 py-2">
      <div className="text-xs text-muted">{label}</div>
      <div className={`text-lg font-bold ${tone ?? ""}`}>{value}</div>
    </div>
  );
}

export default async function AttendancePage({ params, searchParams }: PageProps<"/dashboard/trips/[id]/attendance">) {
  const { actor, trip } = await requireVisibleTrip((await params).id);
  const admin = can(actor, "manage_activities");
  const taker = can(actor, "take_attendance");
  const gatherer = can(actor, "manage_gatherings");
  if (!admin && !taker && !gatherer) notFound();

  const cps = await listCheckpoints(trip.id);
  const wanted = Number((await searchParams).cp);
  const cp = cps.find((c) => c.id === wanted) ?? cps.findLast((c) => isOpen(c)) ?? cps.at(-1);
  const scope = await bookingScope(actor, trip);
  const first = cp?.sortOrder === 1;
  const locked = Boolean(trip.rosterLockedAt);
  const ongoing = trip.status === "ongoing";

  const [roster, rejected, absentees, supervisors, restoreAllowed] = cp
    ? await Promise.all([
        checkpointRoster(trip, cp, scope),
        rejectedRecords(cp, scope),
        locked ? finalAbsentees(trip.id, scope) : Promise.resolve([]),
        admin ? listSupervisorAttendance(trip.id) : Promise.resolve([]),
        getSetting("restore_absent_student"),
      ])
    : [[], [], [], [], "denied" as const];
  const t = tallies(roster);
  const sorted = [...roster].sort((a, b) => ORDER.indexOf(a.state) - ORDER.indexOf(b.state));
  const base = { activityId: trip.id };
  const cpOpen = cp ? isOpen(cp) && !(first && locked) : false;

  return (
    <>
      <PageHeader
        title={`الحضور: ${trip.title}`}
        description={formatDate(trip.date)}
        actions={
          <div className="flex flex-wrap gap-2">
            {taker && ongoing && (
              <Link href={`/dashboard/trips/${trip.id}/scan`} className="rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground">
                Scan QR
              </Link>
            )}
            <Link href={`/dashboard/trips/${trip.id}`} className="rounded-lg border border-border bg-surface px-4 py-2.5 text-sm font-semibold">
              الرحلة
            </Link>
          </div>
        }
      />

      {admin && <TripRunButtons trip={trip} className="mb-4" />}

      {!cp ? (
        <Card>
          <p className="text-sm text-muted">الرحلة لسه مبدأتش. التجمع الأول بيتفتح تلقائي مع «بدء الرحلة».</p>
        </Card>
      ) : (
        <div className="space-y-4">
          <nav className="flex gap-2 overflow-x-auto pb-1" aria-label="التجمعات">
            {cps.map((c) => (
              <Link
                key={c.id}
                href={`?cp=${c.id}`}
                aria-current={c.id === cp.id ? "page" : undefined}
                className={`shrink-0 rounded-full border px-3 py-1.5 text-sm ${c.id === cp.id ? "border-primary bg-primary text-primary-foreground" : "border-border bg-surface"}`}
              >
                {c.name}
                {isOpen(c) && !(c.sortOrder === 1 && locked) && <span className="ms-1.5 inline-block size-2 rounded-full bg-success" aria-label="مفتوح" />}
              </Link>
            ))}
          </nav>

          <Card>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="font-semibold">{cp.name}</h2>
                <p className="mt-1 text-sm text-muted">
                  {cp.scheduledAt && <>الميعاد {formatClock(cp.scheduledAt)} · </>}
                  {trip.lateGraceMinutes ? `سماح ${trip.lateGraceMinutes} دقيقة` : "مفيش سماح"} ·{" "}
                  {cpOpen ? "مفتوح" : cp.openedAt ? "مقفول" : "لسه متفتحش"}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                {gatherer && ongoing && !first && (
                  <ActionButton
                    action={attendanceAction}
                    fields={{ ...base, op: cpOpen ? "close_cp" : "open_cp", checkpointId: cp.id }}
                    variant={cpOpen ? "secondary" : "primary"}
                    className={small}
                  >
                    {cpOpen ? "قفل التجمع" : "فتح التجمع"}
                  </ActionButton>
                )}
                {admin && t.pending > 0 && (
                  <ActionButton action={attendanceAction} fields={{ ...base, op: "confirm_all", checkpointId: cp.id }} className={small}>
                    تأكيد الكل ({t.pending})
                  </ActionButton>
                )}
                {admin && first && !locked && ongoing && (
                  <>
                    {t.unrecorded > 0 && (
                      <ActionButton
                        action={attendanceAction}
                        fields={{ ...base, op: "remaining_absent", checkpointId: cp.id }}
                        variant="secondary"
                        className={small}
                        confirm={`تعليم ${t.unrecorded} طالب غياب؟`}
                      >
                        الباقي غياب
                      </ActionButton>
                    )}
                    <ActionButton
                      action={attendanceAction}
                      fields={{ ...base, op: "lock" }}
                      className={small}
                      confirm="تأكيد عدد الرحلة؟ الكشف هيتثبت والغياب هيتشال من التجمعات الجاية"
                    >
                      تأكيد عدد الرحلة
                    </ActionButton>
                  </>
                )}
              </div>
            </div>

            <div className="mt-4 grid grid-cols-3 gap-2 sm:grid-cols-6">
              <Stat label="الكشف" value={t.total} />
              <Stat label="حاضر" value={t.present} tone="text-success" />
              <Stat label="متأخر" value={t.late} tone="text-warning" />
              <Stat label="مستني التأكيد" value={t.pending} tone="text-warning" />
              <Stat label={first ? "لم يُسجَّل بعد" : "لم يحضر بعد"} value={t.unrecorded} />
              {first && <Stat label="غياب" value={t.absent} tone="text-danger" />}
            </div>
            {first && locked && (
              <p className="mt-3 text-sm font-medium text-success">
                العدد الفعلي للرحلة: {t.present + t.late} طالب (اتأكد {formatClock(trip.rosterLockedAt)})
              </p>
            )}
          </Card>

          <Card className="p-0">
            {sorted.length === 0 ? (
              <p className="p-5 text-sm text-muted">مفيش طلبة في الكشف.</p>
            ) : (
              <ul className="divide-y divide-border">
                {sorted.map((r) => {
                  const state = r.state;
                  const rec = r.record;
                  return (
                    <li key={r.bookingId} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                      <div className="min-w-0">
                        <div className="font-medium">{r.name}</div>
                        <div className="mt-0.5 flex flex-wrap gap-x-3 text-xs text-muted">
                          <span>
                            {r.facultyName} · {YEAR_LABELS[r.year]}
                          </span>
                          {r.busName && <span>{r.busName}</span>}
                          <a href={`tel:${r.phone}`} className="text-primary" dir="ltr">
                            {r.phone}
                          </a>
                          {rec && state !== "absent" && (
                            <span>
                              {formatClock(rec.recordedAt)} · {rec.method === "qr" ? "QR" : "يدوي"}
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge tone={STATE_TONES[state]}>{state === "unrecorded" && !first ? "لم يحضر بعد" : STATE_LABELS[state]}</Badge>
                        {state === "unrecorded" && taker && cpOpen && (
                          <ActionButton action={attendanceAction} fields={{ ...base, op: "present", checkpointId: cp.id, bookingId: r.bookingId }} className={small}>
                            تحضير
                          </ActionButton>
                        )}
                        {state === "unrecorded" && admin && first && !locked && (
                          <ActionButton
                            action={attendanceAction}
                            fields={{ ...base, op: "absent", checkpointId: cp.id, bookingId: r.bookingId }}
                            variant="secondary"
                            className={small}
                          >
                            غياب
                          </ActionButton>
                        )}
                        {state === "pending" && admin && rec && (
                          <ActionButton action={attendanceAction} fields={{ ...base, op: "confirm", checkpointId: cp.id, recordId: rec.id }} className={small}>
                            تأكيد
                          </ActionButton>
                        )}
                        {rec && admin && !(first && locked) && (
                          <ActionButton
                            action={attendanceAction}
                            fields={{ ...base, op: "void", recordId: rec.id }}
                            variant="ghost"
                            className={small}
                            confirm={`إلغاء تسجيل ${r.name}؟`}
                          >
                            إلغاء التسجيل
                          </ActionButton>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>

          {rejected.length > 0 && (
            <Card>
              <h2 className="mb-2 font-semibold text-danger">تسجيلات اترفضت ({rejected.length})</h2>
              <p className="mb-3 text-xs text-muted">الكود اللي في الـ QR مكانش صحيح وقت الاسكان، أو الحجز كان ملغي.</p>
              <ul className="space-y-1.5 text-sm">
                {rejected.map((x) => (
                  <li key={x.id}>
                    {x.name} · {x.reason === "revoked" ? "حجز ملغي" : "QR منتهي أو مش صحيح"} · {formatClock(x.recordedAt)}
                    {x.recorder && <span className="text-muted"> · {x.recorder}</span>}
                  </li>
                ))}
              </ul>
            </Card>
          )}

          {locked && absentees.length > 0 && (
            <Card>
              <h2 className="mb-3 font-semibold">غياب نهائي ({absentees.length})</h2>
              <ul className="divide-y divide-border">
                {absentees.map((a) => (
                  <li key={a.bookingId} className="flex items-center justify-between gap-3 py-2">
                    <span>{a.name}</span>
                    {admin && ongoing && restoreAllowed === "allowed" && (
                      <ActionButton
                        action={attendanceAction}
                        fields={{ ...base, op: "restore", bookingId: a.bookingId }}
                        variant="secondary"
                        className={small}
                        confirm={`إرجاع ${a.name} للرحلة؟ هيظهر في التجمعات الجاية`}
                      >
                        إرجاع للرحلة
                      </ActionButton>
                    )}
                  </li>
                ))}
              </ul>
            </Card>
          )}

          {gatherer && ongoing && locked && (
            <Card>
              <h2 className="mb-3 font-semibold">تجمع جديد</h2>
              <AddCheckpointForm activityId={trip.id} />
            </Card>
          )}

          {admin && (
            <Card>
              <h2 className="mb-3 font-semibold">حضور المشرفين</h2>
              {supervisors.length === 0 ? (
                <p className="text-sm text-muted">مفيش مشرفين على الرحلة.</p>
              ) : (
                <ul className="divide-y divide-border">
                  {supervisors.map((s) => (
                    <li key={s.userId} className="flex flex-wrap items-center justify-between gap-2 py-2">
                      <div>
                        <span className="font-medium">{s.name}</span>
                        {s.busName && <span className="text-xs text-muted"> · {s.busName}</span>}
                      </div>
                      <div className="flex items-center gap-2">
                        {s.recordedAt ? (
                          <>
                            <Badge tone="success">
                              حاضر {formatClock(s.recordedAt)} · {s.method === "qr" ? "QR" : "يدوي"}
                            </Badge>
                            <ActionButton action={attendanceAction} fields={{ ...base, op: "staff_remove", userId: s.userId }} variant="ghost" className={small}>
                              إلغاء
                            </ActionButton>
                          </>
                        ) : (
                          ongoing && (
                            <ActionButton action={attendanceAction} fields={{ ...base, op: "staff_present", userId: s.userId }} className={small}>
                              تحضير
                            </ActionButton>
                          )
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          )}
        </div>
      )}
    </>
  );
}
