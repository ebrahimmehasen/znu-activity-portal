import type { Metadata } from "next";
import { getI18n, getT } from "@/i18n/server";
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

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getT())("الحضور") };
}

const STATE_LABELS: Record<RowState, string> = {
  present: "حاضر",
  late: "متأخر",
  absent: "غائب",
  pending: "بانتظار التأكيد",
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
  const tl = tallies(roster);
  const sorted = [...roster].sort((a, b) => ORDER.indexOf(a.state) - ORDER.indexOf(b.state));
  const base = { activityId: trip.id };
  const cpOpen = cp ? isOpen(cp) && !(first && locked) : false;
  const { locale, t } = await getI18n();
  const clock = (d: Date | null) => formatClock(d, locale);

  return (
    <>
      <PageHeader
        title={t("الحضور: {trip}", { trip: trip.title })}
        description={formatDate(trip.date, locale)}
        actions={
          <div className="flex flex-wrap gap-2">
            {taker && ongoing && (
              <Link href={`/dashboard/trips/${trip.id}/scan`} className="rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground">
                {t("مسح الرموز")}
              </Link>
            )}
            <Link href={`/dashboard/trips/${trip.id}`} className="rounded-lg border border-border bg-surface px-4 py-2.5 text-sm font-semibold">
              {t("الرحلة")}
            </Link>
          </div>
        }
      />

      {admin && <TripRunButtons trip={trip} className="mb-4" />}

      {!cp ? (
        <Card>
          <p className="text-sm text-muted">{t("لم تبدأ الرحلة بعد. يُفتح التجمع الأول تلقائيًا عند «بدء الرحلة».")}</p>
        </Card>
      ) : (
        <div className="space-y-4">
          <nav className="flex gap-2 overflow-x-auto pb-1" aria-label={t("التجمعات")}>
            {cps.map((c) => (
              <Link
                key={c.id}
                href={`?cp=${c.id}`}
                aria-current={c.id === cp.id ? "page" : undefined}
                className={`shrink-0 rounded-full border px-3 py-1.5 text-sm ${c.id === cp.id ? "border-primary bg-primary text-primary-foreground" : "border-border bg-surface"}`}
              >
                {c.name}
                {isOpen(c) && !(c.sortOrder === 1 && locked) && <span className="ms-1.5 inline-block size-2 rounded-full bg-success" aria-label={t("مفتوح")} />}
              </Link>
            ))}
          </nav>

          <Card>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="font-semibold">{cp.name}</h2>
                <p className="mt-1 text-sm text-muted">
                  {cp.scheduledAt && <>{t("الموعد {time}", { time: clock(cp.scheduledAt) })} · </>}
                  {trip.lateGraceMinutes ? t("سماح {n} دقيقة", { n: trip.lateGraceMinutes }) : t("بلا سماح")} ·{" "}
                  {cpOpen ? t("مفتوح") : cp.openedAt ? t("مغلق") : t("لم يُفتح بعد")}
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
                    {cpOpen ? t("إغلاق التجمع") : t("فتح التجمع")}
                  </ActionButton>
                )}
                {admin && tl.pending > 0 && (
                  <ActionButton action={attendanceAction} fields={{ ...base, op: "confirm_all", checkpointId: cp.id }} className={small}>
                    {t("تأكيد الكل ({n})", { n: tl.pending })}
                  </ActionButton>
                )}
                {admin && first && !locked && ongoing && (
                  <>
                    {tl.unrecorded > 0 && (
                      <ActionButton
                        action={attendanceAction}
                        fields={{ ...base, op: "remaining_absent", checkpointId: cp.id }}
                        variant="secondary"
                        className={small}
                        confirm={t("تسجيل غياب {n} طالب؟", { n: tl.unrecorded })}
                      >
                        {t("تسجيل غياب الباقين")}
                      </ActionButton>
                    )}
                    <ActionButton
                      action={attendanceAction}
                      fields={{ ...base, op: "lock" }}
                      className={small}
                      confirm={t("تأكيد عدد الرحلة؟ سيُثبَّت الكشف ويُستبعد الغائبون من التجمعات التالية.")}
                    >
                      {t("تأكيد عدد الرحلة")}
                    </ActionButton>
                  </>
                )}
              </div>
            </div>

            <div className="mt-4 grid grid-cols-3 gap-2 sm:grid-cols-6">
              <Stat label={t("الكشف")} value={tl.total} />
              <Stat label={t("حاضر")} value={tl.present} tone="text-success" />
              <Stat label={t("متأخر")} value={tl.late} tone="text-warning" />
              <Stat label={t("بانتظار التأكيد")} value={tl.pending} tone="text-warning" />
              <Stat label={first ? t("لم يُسجَّل بعد") : t("لم يحضر بعد")} value={tl.unrecorded} />
              {first && <Stat label={t("غائب")} value={tl.absent} tone="text-danger" />}
            </div>
            {first && locked && (
              <p className="mt-3 text-sm font-medium text-success">
                {t("العدد الفعلي للرحلة: {n} طالب (أُكِّد {time})", { n: tl.present + tl.late, time: clock(trip.rosterLockedAt) })}
              </p>
            )}
          </Card>

          <Card className="p-0">
            {sorted.length === 0 ? (
              <p className="p-5 text-sm text-muted">{t("لا يوجد طلاب في الكشف.")}</p>
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
                            {r.facultyName} · {t(YEAR_LABELS[r.year])}
                          </span>
                          {r.busName && <span>{r.busName}</span>}
                          <a href={`tel:${r.phone}`} className="text-primary" dir="ltr">
                            {r.phone}
                          </a>
                          {rec && state !== "absent" && (
                            <span>
                              {clock(rec.recordedAt)} · {rec.method === "qr" ? "QR" : t("يدوي")}
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge tone={STATE_TONES[state]}>{state === "unrecorded" && !first ? t("لم يحضر بعد") : t(STATE_LABELS[state])}</Badge>
                        {state === "unrecorded" && taker && cpOpen && (
                          <ActionButton action={attendanceAction} fields={{ ...base, op: "present", checkpointId: cp.id, bookingId: r.bookingId }} className={small}>
                            {t("تسجيل الحضور")}
                          </ActionButton>
                        )}
                        {state === "unrecorded" && admin && first && !locked && (
                          <ActionButton
                            action={attendanceAction}
                            fields={{ ...base, op: "absent", checkpointId: cp.id, bookingId: r.bookingId }}
                            variant="secondary"
                            className={small}
                          >
                            {t("غائب")}
                          </ActionButton>
                        )}
                        {state === "pending" && admin && rec && (
                          <ActionButton action={attendanceAction} fields={{ ...base, op: "confirm", checkpointId: cp.id, recordId: rec.id }} className={small}>
                            {t("تأكيد")}
                          </ActionButton>
                        )}
                        {rec && admin && !(first && locked) && (
                          <ActionButton
                            action={attendanceAction}
                            fields={{ ...base, op: "void", recordId: rec.id }}
                            variant="ghost"
                            className={small}
                            confirm={t("إلغاء تسجيل {name}؟", { name: r.name })}
                          >
                            {t("إلغاء التسجيل")}
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
              <h2 className="mb-2 font-semibold text-danger">{t("تسجيلات مرفوضة ({n})", { n: rejected.length })}</h2>
              <p className="mb-3 text-xs text-muted">{t("لم يكن رمز QR صحيحًا وقت المسح، أو كان الحجز ملغى.")}</p>
              <ul className="space-y-1.5 text-sm">
                {rejected.map((x) => (
                  <li key={x.id}>
                    {x.name} · {x.reason === "revoked" ? t("حجز ملغى") : t("رمز QR منتهي أو غير صحيح")} · {clock(x.recordedAt)}
                    {x.recorder && <span className="text-muted"> · {x.recorder}</span>}
                  </li>
                ))}
              </ul>
            </Card>
          )}

          {locked && absentees.length > 0 && (
            <Card>
              <h2 className="mb-3 font-semibold">{t("غياب نهائي ({n})", { n: absentees.length })}</h2>
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
                        confirm={t("إعادة {name} إلى الرحلة؟ سيظهر في التجمعات التالية.", { name: a.name })}
                      >
                        {t("إعادة إلى الرحلة")}
                      </ActionButton>
                    )}
                  </li>
                ))}
              </ul>
            </Card>
          )}

          {gatherer && ongoing && locked && (
            <Card>
              <h2 className="mb-3 font-semibold">{t("تجمع جديد")}</h2>
              <AddCheckpointForm activityId={trip.id} />
            </Card>
          )}

          {admin && (
            <Card>
              <h2 className="mb-3 font-semibold">{t("حضور المشرفين")}</h2>
              {supervisors.length === 0 ? (
                <p className="text-sm text-muted">{t("لا يوجد مشرفون على الرحلة.")}</p>
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
                              {t("حاضر {time}", { time: clock(s.recordedAt) })} · {s.method === "qr" ? "QR" : t("يدوي")}
                            </Badge>
                            <ActionButton action={attendanceAction} fields={{ ...base, op: "staff_remove", userId: s.userId }} variant="ghost" className={small}>
                              {t("إلغاء")}
                            </ActionButton>
                          </>
                        ) : (
                          ongoing && (
                            <ActionButton action={attendanceAction} fields={{ ...base, op: "staff_present", userId: s.userId }} className={small}>
                              {t("تسجيل الحضور")}
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
