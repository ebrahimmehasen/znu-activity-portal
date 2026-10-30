import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Logo } from "@/components/logo";
import { Preferences } from "@/components/preferences";
import { Card } from "@/components/ui";
import { getI18n, getT, getTheme } from "@/i18n/server";
import { getPublicTrip } from "@/lib/bookings/service";
import { formatDate, formatTime } from "@/lib/dates";
import { listFaculties } from "@/lib/faculties/service";
import { getSchedule } from "@/lib/trips/service";
import { submitBookingAction } from "./actions";
import { BookingForm } from "./booking-form";

export async function generateMetadata({ params }: PageProps<"/book/[token]">): Promise<Metadata> {
  const [data, t] = await Promise.all([getPublicTrip((await params).token), getT()]);
  return { title: data ? t("حجز {trip}", { trip: data.trip.title }) : t("الحجز"), robots: { index: false, follow: false } };
}

const CLOSED_MESSAGES = {
  closed: "الحجز في هذه الرحلة مغلق حاليًا.",
  full: "اكتمل العدد وأُغلق الحجز.",
};

export default async function BookPage({ params }: PageProps<"/book/[token]">) {
  const { token } = await params;
  const [{ locale, t }, theme] = await Promise.all([getI18n(), getTheme()]);
  const data = await getPublicTrip(token);
  if (!data) notFound();
  const { trip, availability } = data;
  const [schedule, faculties] = await Promise.all([getSchedule(trip.id), listFaculties({ activeOnly: true })]);
  const times = [
    trip.startTime && t("الانطلاق {time}", { time: formatTime(trip.startTime, locale) }),
    trip.endTime && t("العودة {time}", { time: formatTime(trip.endTime, locale) }),
  ].filter(Boolean);

  return (
    <main className="mx-auto w-full max-w-2xl space-y-4 p-4 sm:py-8">
      <div className="flex items-center justify-between gap-2">
        <p className="flex items-center gap-2 text-sm font-semibold text-primary">
          <Logo size={40} />
          <span>
            {t("بوابة الأنشطة")} — {t("جامعة الزقازيق الأهلية")}
          </span>
        </p>
        <Preferences theme={theme} />
      </div>

      <Card className="space-y-3">
        <h1 className="text-xl font-bold sm:text-2xl">{trip.title}</h1>
        <div className="space-y-1 text-sm text-muted">
          <p>{formatDate(trip.date, locale)}</p>
          {times.length > 0 && <p>{times.join(" · ")}</p>}
          {trip.location && <p>{t("المكان: {place}", { place: trip.location })}</p>}
          {trip.feeEnabled && <p className="font-semibold text-foreground">{t("الاشتراك: {amount} جنيه", { amount: Number(trip.feeAmount) })}</p>}
        </div>
        {trip.description && <p className="whitespace-pre-line text-sm leading-7">{trip.description}</p>}
        {schedule.length > 0 && (
          <details className="rounded-lg bg-background p-3 text-sm">
            <summary className="cursor-pointer font-semibold">{t("برنامج الرحلة")}</summary>
            <ol className="mt-3 space-y-2">
              {schedule.map((s) => (
                <li key={s.id} className="flex gap-3">
                  <span className="w-16 shrink-0 font-semibold text-primary">{formatTime(s.time, locale) || "•"}</span>
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
        <h2 className="mb-4 font-semibold">{t("بيانات الحجز")}</h2>
        {availability === "open" || availability === "waitlist" ? (
          <BookingForm action={submitBookingAction.bind(null, token)} faculties={faculties} waitlist={availability === "waitlist"} />
        ) : (
          <p className="py-6 text-center text-muted">{t(CLOSED_MESSAGES[availability])}</p>
        )}
      </Card>
    </main>
  );
}
