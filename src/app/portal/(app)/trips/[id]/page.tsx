import type { Metadata } from "next";
import { getT } from "@/i18n/server";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AnnouncementList } from "@/components/announcements/announcement-list";
import { MarkRead } from "@/components/announcements/mark-read";
import { Alert, Badge, Card, PageHeader } from "@/components/ui";
import { getI18n } from "@/i18n/server";
import { listStudentAnnouncements } from "@/lib/announcements/service";
import { BOOKING_STATUS_LABELS } from "@/lib/bookings/service";
import { formatDate, formatTime } from "@/lib/dates";
import { getStudentTrip } from "@/lib/students/auth";
import { requireStudent } from "@/lib/students/session";
import { STATUS_LABELS, STATUS_TONES } from "@/lib/trips/labels";
import { getSchedule } from "@/lib/trips/service";
import { markStudentReadAction } from "../../../actions";
import { BOOKING_TONES } from "../../booking-tones";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getT())("تفاصيل الرحلة") };
}

const BOOKING_NOTES = {
  pending: "وصل طلبك وهو بانتظار تأكيد المسؤولين.",
  waitlisted: "أنت في قائمة الانتظار. إذا توفّر مكان فستُنقل إلى المعلّق.",
  cancelled: "أُلغي حجزك في هذه الرحلة. إذا كان هناك خطأ فتواصل مع المسؤول عن الرحلة.",
  confirmed: null,
} as const;

function Info({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs text-muted">{label}</dt>
      <dd className="mt-0.5 font-medium">{children || "—"}</dd>
    </div>
  );
}

export default async function StudentTripPage({ params }: { params: Promise<{ id: string }> }) {
  const student = await requireStudent();
  const id = Number((await params).id);
  // Only the student's own trips resolve; anything else is a 404.
  const row = Number.isInteger(id) ? await getStudentTrip(student.id, id) : null;
  if (!row) notFound();
  const { booking, trip, busName } = row;
  const [schedule, news] = await Promise.all([getSchedule(trip.id), listStudentAnnouncements(student.id, trip.id)]);
  const note = BOOKING_NOTES[booking.status];
  const { locale, t } = await getI18n();

  return (
    <>
      <PageHeader
        title={trip.title}
        description={formatDate(trip.date, locale)}
        actions={
          <Link href="/portal" className="rounded-lg border border-border bg-surface px-4 py-2.5 text-sm font-semibold">
            {t("رحلاتي")}
          </Link>
        }
      />

      <div className="space-y-4">
        <Card className="space-y-4">
          <div className="flex flex-wrap gap-2">
            <Badge tone={STATUS_TONES[trip.status]}>{t(STATUS_LABELS[trip.status])}</Badge>
            <Badge tone={BOOKING_TONES[booking.status]}>
              {t("حجزك: {status}", { status: t(BOOKING_STATUS_LABELS[booking.status]) })}
              {booking.status === "waitlisted" && booking.waitlistPosition ? ` #${booking.waitlistPosition}` : ""}
            </Badge>
          </div>
          {note && <Alert tone={booking.status === "cancelled" ? "danger" : "success"}>{note}</Alert>}
          <dl className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <Info label={t("الانطلاق")}>{formatTime(trip.startTime, locale)}</Info>
            <Info label={t("العودة")}>{formatTime(trip.endTime, locale)}</Info>
            <Info label={t("المكان")}>{trip.location}</Info>
            {booking.status === "confirmed" && trip.busesEnabled && <Info label={t("الحافلة")}>{busName ?? t("لم تُحدَّد بعد")}</Info>}
            {trip.feeEnabled && (
              <Info label={t("الاشتراك")}>
                {t("{amount} جنيه", { amount: Number(trip.feeAmount) })} · {booking.paidAt ? `${t("مدفوع")} ✓` : t("لم يُدفع بعد")}
              </Info>
            )}
          </dl>
          {trip.description && <p className="whitespace-pre-line text-sm leading-7">{trip.description}</p>}
        </Card>

        {booking.status === "confirmed" && trip.status !== "finished" && (
          <Card className="space-y-2 text-center">
            <h2 className="font-semibold">{t("رمز الحضور")}</h2>
            <p className="text-sm text-muted">
              {trip.status === "ongoing"
                ? t("بدأت الرحلة. اعرض الرمز على المشرف ليسجّل حضورك.")
                : t("يظهر الرمز يوم الرحلة عند بدئها، ويعمل دون إنترنت.")}
            </p>
            {/* A full page load, so the cached copy opens when offline. */}
            <a href="/portal/qr" className="inline-flex rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground">
              {t("افتح رمز الحضور")}
            </a>
          </Card>
        )}

        {news.length > 0 && (
          <Card>
            <h2 className="mb-3 font-semibold">{t("الإعلانات")}</h2>
            <MarkRead ids={news.filter((a) => !a.read).map((a) => a.id)} action={markStudentReadAction} />
            <AnnouncementList items={news} showAudience={false} />
          </Card>
        )}

        <Card>
          <h2 className="mb-3 font-semibold">{t("برنامج الرحلة")}</h2>
          {schedule.length === 0 ? (
            <p className="text-sm text-muted">{t("لا يوجد برنامج بعد.")}</p>
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
      </div>
    </>
  );
}
