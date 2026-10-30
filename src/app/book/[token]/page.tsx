import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Card } from "@/components/ui";
import { getPublicTrip } from "@/lib/bookings/service";
import { formatDate, formatTime } from "@/lib/dates";
import { listFaculties } from "@/lib/faculties/service";
import { getSchedule } from "@/lib/trips/service";
import { submitBookingAction } from "./actions";
import { BookingForm } from "./booking-form";

export async function generateMetadata({ params }: PageProps<"/book/[token]">): Promise<Metadata> {
  const data = await getPublicTrip((await params).token);
  return { title: data ? `حجز ${data.trip.title}` : "الحجز", robots: { index: false, follow: false } };
}

const CLOSED_MESSAGES = {
  closed: "الحجز في الرحلة دي مقفول دلوقتي.",
  full: "العدد اكتمل والحجز اتقفل.",
};

export default async function BookPage({ params }: PageProps<"/book/[token]">) {
  const { token } = await params;
  const data = await getPublicTrip(token);
  if (!data) notFound();
  const { trip, availability } = data;
  const [schedule, faculties] = await Promise.all([getSchedule(trip.id), listFaculties({ activeOnly: true })]);
  const times = [trip.startTime && `التحرك ${formatTime(trip.startTime)}`, trip.endTime && `الرجوع ${formatTime(trip.endTime)}`].filter(Boolean);

  return (
    <main className="mx-auto w-full max-w-2xl space-y-4 p-4 sm:py-8">
      <p className="text-center text-sm font-semibold text-primary">بوابة الأنشطة — جامعة الزقازيق الأهلية</p>

      <Card className="space-y-3">
        <h1 className="text-xl font-bold sm:text-2xl">{trip.title}</h1>
        <div className="space-y-1 text-sm text-muted">
          <p>{formatDate(trip.date)}</p>
          {times.length > 0 && <p>{times.join(" · ")}</p>}
          {trip.location && <p>المكان: {trip.location}</p>}
          {trip.feeEnabled && <p className="font-semibold text-foreground">الاشتراك: {Number(trip.feeAmount)} جنيه</p>}
        </div>
        {trip.description && <p className="whitespace-pre-line text-sm leading-7">{trip.description}</p>}
        {schedule.length > 0 && (
          <details className="rounded-lg bg-background p-3 text-sm">
            <summary className="cursor-pointer font-semibold">برنامج الرحلة</summary>
            <ol className="mt-3 space-y-2">
              {schedule.map((s) => (
                <li key={s.id} className="flex gap-3">
                  <span className="w-16 shrink-0 font-semibold text-primary">{formatTime(s.time) || "•"}</span>
                  <span>
                    {s.title}
                    {s.notes && <span className="block text-muted">{s.notes}</span>}
                  </span>
                </li>
              ))}
            </ol>
          </details>
        )}
      </Card>

      <Card>
        <h2 className="mb-4 font-semibold">بيانات الحجز</h2>
        {availability === "open" || availability === "waitlist" ? (
          <BookingForm action={submitBookingAction.bind(null, token)} faculties={faculties} waitlist={availability === "waitlist"} />
        ) : (
          <p className="py-6 text-center text-muted">{CLOSED_MESSAGES[availability]}</p>
        )}
      </Card>
    </main>
  );
}
