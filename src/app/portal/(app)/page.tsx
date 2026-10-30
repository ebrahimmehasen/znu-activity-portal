import type { Metadata } from "next";
import Link from "next/link";
import { QrReadiness } from "@/components/qr/student-qr";
import { Badge, Card, PageHeader } from "@/components/ui";
import { BOOKING_STATUS_LABELS } from "@/lib/bookings/service";
import { formatDate, formatTime } from "@/lib/dates";
import { listStudentTrips } from "@/lib/students/auth";
import { requireStudent } from "@/lib/students/session";
import { STATUS_LIST_LABELS, isStatus } from "@/lib/trips/labels";
import { BOOKING_TONES } from "./booking-tones";

export const metadata: Metadata = { title: "رحلاتي" };

export default async function PortalHome({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const student = await requireStudent();
  const sp = await searchParams;
  const trips = await listStudentTrips(student.id);
  const counts = { upcoming: 0, ongoing: 0, finished: 0 };
  for (const t of trips) counts[t.trip.status]++;
  // Open on the running trip if there is one.
  const status = isStatus(sp.status) ? sp.status : counts.ongoing ? "ongoing" : "upcoming";
  const shown = trips.filter((t) => t.trip.status === status);

  return (
    <>
      <PageHeader title={`أهلًا ${student.name.split(" ")[0]}`} description="رحلاتك وحالة حجزك في كل رحلة" />

      <div className="mb-5">
        <QrReadiness />
      </div>

      <div className="mb-4 flex gap-2 overflow-x-auto" role="tablist">
        {(Object.keys(STATUS_LIST_LABELS) as (keyof typeof STATUS_LIST_LABELS)[]).map((s) => (
          <Link
            key={s}
            href={`/portal?status=${s}`}
            role="tab"
            aria-selected={s === status}
            className={`whitespace-nowrap rounded-full px-4 py-2 text-sm font-medium ${
              s === status ? "bg-primary text-primary-foreground" : "border border-border bg-surface text-muted"
            }`}
          >
            {STATUS_LIST_LABELS[s]} ({counts[s]})
          </Link>
        ))}
      </div>

      {shown.length === 0 ? (
        <Card className="py-10 text-center text-muted">مفيش رحلات {STATUS_LIST_LABELS[status]}.</Card>
      ) : (
        <div className="space-y-3">
          {shown.map((t) => (
            <Link key={t.bookingId} href={`/portal/trips/${t.trip.id}`} className="block">
              <Card className="transition hover:border-primary/40">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <div className="font-semibold">{t.trip.title}</div>
                    <div className="mt-1 text-sm text-muted">
                      {formatDate(t.trip.date)}
                      {t.trip.startTime && ` · ${formatTime(t.trip.startTime)}`}
                      {t.trip.location && ` · ${t.trip.location}`}
                    </div>
                  </div>
                  <Badge tone={BOOKING_TONES[t.bookingStatus]}>
                    {BOOKING_STATUS_LABELS[t.bookingStatus]}
                    {t.bookingStatus === "waitlisted" && t.waitlistPosition ? ` #${t.waitlistPosition}` : ""}
                  </Badge>
                </div>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </>
  );
}
