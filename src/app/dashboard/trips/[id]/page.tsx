import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ConfirmButton } from "@/components/confirm-button";
import { Badge, Card, PageHeader } from "@/components/ui";
import { requireAbility } from "@/lib/auth/session";
import { formatDate, formatTime } from "@/lib/dates";
import { STATUS_LABELS, STATUS_TONES } from "@/lib/trips/labels";
import { getSchedule, getTrip } from "@/lib/trips/service";
import { deleteTripAction } from "../actions";
import { BookingsCard } from "./bookings/bookings-card";
import { BusesCard } from "./buses/buses-card";

export const metadata: Metadata = { title: "تفاصيل الرحلة" };

function Info({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs text-muted">{label}</dt>
      <dd className="mt-0.5 font-medium">{children || "—"}</dd>
    </div>
  );
}

export default async function TripPage({ params }: PageProps<"/dashboard/trips/[id]">) {
  await requireAbility("manage_activities");
  const id = Number((await params).id);
  const trip = Number.isInteger(id) ? await getTrip(id) : null;
  if (!trip) notFound();
  const schedule = await getSchedule(trip.id);

  return (
    <>
      <PageHeader
        title={trip.title}
        description={formatDate(trip.date)}
        actions={
          <div className="flex gap-2">
            {trip.status !== "finished" && (
              <Link href={`/dashboard/trips/${trip.id}/edit`} className="rounded-lg border border-border bg-surface px-4 py-2.5 text-sm font-semibold">
                تعديل
              </Link>
            )}
            {trip.status === "upcoming" && (
              <form action={deleteTripAction}>
                <input type="hidden" name="id" value={trip.id} />
                <ConfirmButton variant="danger" message={`حذف رحلة "${trip.title}" نهائيًا؟`}>
                  حذف
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
              <Badge tone={STATUS_TONES[trip.status]}>{STATUS_LABELS[trip.status]}</Badge>
            </div>
            <dl className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              <Info label="التحرك">{formatTime(trip.startTime)}</Info>
              <Info label="الرجوع">{formatTime(trip.endTime)}</Info>
              <Info label="المكان">{trip.location}</Info>
              <Info label="العدد الأقصى">{trip.capacity}</Info>
            </dl>
            {trip.description && <p className="mt-4 whitespace-pre-line text-sm leading-7">{trip.description}</p>}
          </Card>

          <BookingsCard trip={trip} />

          <Card>
            <h2 className="mb-3 font-semibold">برنامج الرحلة</h2>
            {schedule.length === 0 ? (
              <p className="text-sm text-muted">مفيش برنامج.</p>
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

          {trip.busesEnabled && <BusesCard trip={trip} />}
        </div>

        <Card className="h-fit">
          <h2 className="mb-3 font-semibold">إعدادات الرحلة</h2>
          <dl className="space-y-3 text-sm">
            <Info label="لما العدد يكمل">{trip.whenFull === "close" ? "قفل الفورم" : "قائمة انتظار"}</Info>
            {trip.whenFull === "waitlist" && (
              <Info label="ترقية قائمة الانتظار">{trip.waitlistPromotion === "auto" ? "تلقائي" : "يدوي من الأدمن"}</Info>
            )}
            <Info label="الاشتراك">{trip.feeEnabled ? `${Number(trip.feeAmount)} جنيه` : "غير مفعّل"}</Info>
            {trip.feeEnabled && <Info label="شرط الدفع">{trip.paymentRequired ? "التأكيد بعد الدفع" : "مستقل عن الدفع"}</Info>}
            <Info label="فترة السماح">{trip.lateGraceMinutes ? `${trip.lateGraceMinutes} دقيقة` : "مفيش سماح"}</Info>
            <Info label="الأتوبيسات">{trip.busesEnabled ? "مفعّلة" : "غير مفعّلة"}</Info>
            {trip.busesEnabled && <Info label="نطاق المشرف">{trip.supervisorScope === "bus" ? "أتوبيسه بس" : "الرحلة كلها"}</Info>}
          </dl>
        </Card>
      </div>
    </>
  );
}
