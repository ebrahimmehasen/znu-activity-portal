import type { Metadata } from "next";
import { getI18n, getT } from "@/i18n/server";
import Link from "next/link";
import { ConfirmButton } from "@/components/confirm-button";
import { PurgeForm } from "@/components/purge-form";
import { Badge, Card, PageHeader } from "@/components/ui";
import { can } from "@/lib/authz";
import { listBuses } from "@/lib/buses/service";
import { formatDate, formatTime } from "@/lib/dates";
import { STATUS_LABELS, STATUS_TONES } from "@/lib/trips/labels";
import { assignment } from "@/lib/supervisors/scope";
import { requireVisibleTrip } from "@/lib/trips/access";
import { getSchedule } from "@/lib/trips/service";
import { purgeTripAction } from "../../purge-actions";
import { deleteTripAction } from "../actions";
import { AnnouncementsCard } from "./announcements-card";
import { TripRunButtons } from "./attendance/trip-run";
import { BookingsCard } from "./bookings/bookings-card";
import { BusesCard } from "./buses/buses-card";
import { TripSupervisorsCard } from "./supervisors/supervisors-card";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getT())("تفاصيل الرحلة") };
}

function Info({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs text-muted">{label}</dt>
      <dd className="mt-0.5 font-medium">{children || "—"}</dd>
    </div>
  );
}

export default async function TripPage({ params }: PageProps<"/dashboard/trips/[id]">) {
  const { actor, trip } = await requireVisibleTrip((await params).id);
  const manager = can(actor, "manage_activities");
  const attendance = manager || can(actor, "take_attendance") || can(actor, "manage_gatherings");
  const [schedule, mine] = await Promise.all([
    getSchedule(trip.id),
    actor.role === "supervisor" ? assignment(actor.id, trip.id) : Promise.resolve(null),
  ]);
  const myBus = mine?.busId ? (await listBuses(trip.id)).find((b) => b.id === mine.busId)?.name : undefined;
  const { locale, t } = await getI18n();

  return (
    <>
      <PageHeader
        title={trip.title}
        description={formatDate(trip.date, locale)}
        actions={
          <div className="flex flex-wrap gap-2">
            {manager && <TripRunButtons trip={trip} />}
            {can(actor, "view_trip_dashboard") && trip.status !== "upcoming" && (
              <Link href={`/dashboard/trips/${trip.id}/dashboard`} className="rounded-lg border border-border bg-surface px-4 py-2.5 text-sm font-semibold">
                {t("لوحة المتابعة")}
              </Link>
            )}
            {attendance && trip.status !== "upcoming" && (
              <Link href={`/dashboard/trips/${trip.id}/attendance`} className="rounded-lg border border-border bg-surface px-4 py-2.5 text-sm font-semibold">
                {t("الحضور والتجمعات")}
              </Link>
            )}
            {manager && (
              <Link href={`/dashboard/trips/${trip.id}/report`} className="rounded-lg border border-border bg-surface px-4 py-2.5 text-sm font-semibold">
                {t("التقرير")}
              </Link>
            )}
            {manager && trip.status !== "finished" && (
              <Link href={`/dashboard/trips/${trip.id}/edit`} className="rounded-lg border border-border bg-surface px-4 py-2.5 text-sm font-semibold">
                {t("تعديل")}
              </Link>
            )}
            {manager && trip.status === "upcoming" && (
              <form action={deleteTripAction}>
                <input type="hidden" name="id" value={trip.id} />
                <ConfirmButton variant="danger" message={t("حذف رحلة «{trip}» نهائيًا؟", { trip: trip.title })}>
                  {t("حذف")}
                </ConfirmButton>
              </form>
            )}
          </div>
        }
      />

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <Card>
            <div className="mb-4 flex items-center gap-2">
              <Badge tone={STATUS_TONES[trip.status]}>{t(STATUS_LABELS[trip.status])}</Badge>
            </div>
            <dl className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              <Info label={t("الانطلاق")}>{formatTime(trip.startTime, locale)}</Info>
              <Info label={t("العودة")}>{formatTime(trip.endTime, locale)}</Info>
              <Info label={t("المكان")}>{trip.location}</Info>
              <Info label={t("الحد الأقصى للعدد")}>{trip.capacity}</Info>
            </dl>
            {trip.description && <p className="mt-4 whitespace-pre-line text-sm leading-7">{trip.description}</p>}
          </Card>

          <AnnouncementsCard actor={actor} trip={trip} />

          <BookingsCard trip={trip} canToggle={manager} />

          <Card>
            <h2 className="mb-3 font-semibold">{t("برنامج الرحلة")}</h2>
            {schedule.length === 0 ? (
              <p className="text-sm text-muted">{t("لا يوجد برنامج.")}</p>
            ) : (
              <ol className="space-y-3">
                {schedule.map((s) => (
                  <li key={s.id} className="flex gap-3">
                    <span className="w-20 shrink-0 text-sm font-semibold text-primary">{formatTime(s.time, locale) || "•"}</span>
                    <div>
                      <div className="font-medium">{s.title}</div>
                      {s.notes && <div className="text-sm text-muted">{s.notes}</div>}
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </Card>

          {manager && trip.busesEnabled && <BusesCard trip={trip} />}
          {manager && <TripSupervisorsCard trip={trip} />}

          {manager && trip.status === "finished" && (
            <details className="rounded-xl border border-danger/30 bg-danger/5 p-4">
              <summary className="cursor-pointer font-semibold text-danger">{t("حذف بيانات الرحلة")}</summary>
              <p className="my-3 text-sm">
                {t("ستُحذف الرحلة وكل حجوزاتها وحضورها وتجمعاتها وإعلاناتها نهائيًا. نزِّل التقرير أولًا إذا احتجت إليه. لن يُحذف الطلاب أنفسهم.")}
              </p>
              <PurgeForm
                action={purgeTripAction}
                id={trip.id}
                expected={trip.title}
                prompt={t("اكتب اسم الرحلة للتأكيد")}
                confirmMessage={t("حذف كل بيانات «{trip}» نهائيًا؟ لا يمكن التراجع.", { trip: trip.title })}
              />
            </details>
          )}
        </div>

        <Card className="h-fit">
          <h2 className="mb-3 font-semibold">{t("إعدادات الرحلة")}</h2>
          <dl className="space-y-3 text-sm">
            <Info label={t("عند اكتمال العدد")}>{trip.whenFull === "close" ? t("إغلاق النموذج") : t("قائمة الانتظار")}</Info>
            {trip.whenFull === "waitlist" && (
              <Info label={t("النقل من قائمة الانتظار")}>{trip.waitlistPromotion === "auto" ? t("تلقائي") : t("يدويًا من المسؤول")}</Info>
            )}
            <Info label={t("الاشتراك")}>{trip.feeEnabled ? t("{amount} جنيه", { amount: Number(trip.feeAmount) }) : t("غير مفعَّل")}</Info>
            {trip.feeEnabled && <Info label={t("شرط الدفع")}>{trip.paymentRequired ? t("التأكيد بعد الدفع") : t("مستقل عن الدفع")}</Info>}
            <Info label={t("فترة السماح")}>{trip.lateGraceMinutes ? t("{n} دقيقة", { n: trip.lateGraceMinutes }) : t("بلا سماح")}</Info>
            <Info label={t("الحافلات")}>{trip.busesEnabled ? t("مفعَّلة") : t("غير مفعَّلة")}</Info>
            {actor.role === "supervisor" && trip.busesEnabled && <Info label={t("حافلتك")}>{myBus ?? t("لم تُعيَّن بعد")}</Info>}
            {trip.busesEnabled && <Info label={t("نطاق المشرف")}>{trip.supervisorScope === "bus" ? t("حافلته فقط") : t("الرحلة كاملة")}</Info>}
          </dl>
        </Card>
      </div>
    </>
  );
}
