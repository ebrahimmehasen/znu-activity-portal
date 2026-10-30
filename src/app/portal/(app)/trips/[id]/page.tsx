import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AnnouncementList } from "@/components/announcements/announcement-list";
import { MarkRead } from "@/components/announcements/mark-read";
import { Alert, Badge, Card, PageHeader } from "@/components/ui";
import { listStudentAnnouncements } from "@/lib/announcements/service";
import { BOOKING_STATUS_LABELS } from "@/lib/bookings/service";
import { formatDate, formatTime } from "@/lib/dates";
import { getStudentTrip } from "@/lib/students/auth";
import { requireStudent } from "@/lib/students/session";
import { STATUS_LABELS, STATUS_TONES } from "@/lib/trips/labels";
import { getSchedule } from "@/lib/trips/service";
import { markStudentReadAction } from "../../../actions";
import { BOOKING_TONES } from "../../booking-tones";

export const metadata: Metadata = { title: "تفاصيل الرحلة" };

const BOOKING_NOTES = {
  pending: "طلبك وصل وفي انتظار التأكيد من المسؤولين.",
  waitlisted: "انت في قائمة الانتظار. لو مكان فضي هتتنقل للمعلّق.",
  cancelled: "حجزك في الرحلة دي اتلغى. لو فيه غلط كلّم المسؤول عن الرحلة.",
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

  return (
    <>
      <PageHeader
        title={trip.title}
        description={formatDate(trip.date)}
        actions={
          <Link href="/portal" className="rounded-lg border border-border bg-surface px-4 py-2.5 text-sm font-semibold">
            رحلاتي
          </Link>
        }
      />

      <div className="space-y-4">
        <Card className="space-y-4">
          <div className="flex flex-wrap gap-2">
            <Badge tone={STATUS_TONES[trip.status]}>{STATUS_LABELS[trip.status]}</Badge>
            <Badge tone={BOOKING_TONES[booking.status]}>
              حجزك: {BOOKING_STATUS_LABELS[booking.status]}
              {booking.status === "waitlisted" && booking.waitlistPosition ? ` #${booking.waitlistPosition}` : ""}
            </Badge>
          </div>
          {note && <Alert tone={booking.status === "cancelled" ? "danger" : "success"}>{note}</Alert>}
          <dl className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <Info label="التحرك">{formatTime(trip.startTime)}</Info>
            <Info label="الرجوع">{formatTime(trip.endTime)}</Info>
            <Info label="المكان">{trip.location}</Info>
            {booking.status === "confirmed" && trip.busesEnabled && <Info label="الأتوبيس">{busName ?? "لسه متحددش"}</Info>}
            {trip.feeEnabled && (
              <Info label="الاشتراك">
                {Number(trip.feeAmount)} جنيه · {booking.paidAt ? "اتدفع ✓" : "لسه متدفعش"}
              </Info>
            )}
          </dl>
          {trip.description && <p className="whitespace-pre-line text-sm leading-7">{trip.description}</p>}
        </Card>

        {booking.status === "confirmed" && trip.status !== "finished" && (
          <Card className="space-y-2 text-center">
            <h2 className="font-semibold">QR الحضور</h2>
            <p className="text-sm text-muted">
              {trip.status === "ongoing"
                ? "الرحلة بدأت. وريّ الـ QR للمشرف عشان يسجّل حضورك."
                : "الـ QR بيظهر يوم الرحلة لما تبدأ، وبيشتغل من غير نت."}
            </p>
            {/* A full page load, so the cached copy opens when offline. */}
            <a href="/portal/qr" className="inline-flex rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground">
              افتح QR الحضور
            </a>
          </Card>
        )}

        {news.length > 0 && (
          <Card>
            <h2 className="mb-3 font-semibold">الإعلانات</h2>
            <MarkRead ids={news.filter((a) => !a.read).map((a) => a.id)} action={markStudentReadAction} />
            <AnnouncementList items={news} showAudience={false} />
          </Card>
        )}

        <Card>
          <h2 className="mb-3 font-semibold">برنامج الرحلة</h2>
          {schedule.length === 0 ? (
            <p className="text-sm text-muted">مفيش برنامج لسه.</p>
          ) : (
            <ol className="space-y-3">
              {schedule.map((s) => (
                <li key={s.id} className="flex gap-3">
                  <span className="w-20 shrink-0 text-sm font-semibold text-primary">{formatTime(s.time) || "•"}</span>
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
