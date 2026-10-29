import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/ui";
import { requireAbility } from "@/lib/auth/session";
import { shortTime } from "@/lib/dates";
import { getSchedule, getTrip } from "@/lib/trips/service";
import { TripForm } from "../../trip-form";

export const metadata: Metadata = { title: "تعديل رحلة" };

export default async function EditTripPage({ params }: PageProps<"/dashboard/trips/[id]/edit">) {
  await requireAbility("manage_activities");
  const id = Number((await params).id);
  const trip = Number.isInteger(id) ? await getTrip(id) : null;
  if (!trip || trip.status === "finished") notFound();
  const schedule = await getSchedule(trip.id);

  return (
    <>
      <PageHeader title={`تعديل: ${trip.title}`} />
      <TripForm
        initial={{
          id: trip.id,
          title: trip.title,
          description: trip.description ?? "",
          date: trip.date,
          dateLocked: trip.status === "ongoing",
          startTime: shortTime(trip.startTime),
          endTime: shortTime(trip.endTime),
          location: trip.location ?? "",
          capacity: String(trip.capacity),
          whenFull: trip.whenFull,
          waitlistPromotion: trip.waitlistPromotion,
          feeEnabled: trip.feeEnabled,
          feeAmount: trip.feeAmount ?? "",
          paymentRequired: trip.paymentRequired,
          lateGraceMinutes: String(trip.lateGraceMinutes),
          busesEnabled: trip.busesEnabled,
          supervisorScope: trip.supervisorScope,
          schedule: schedule.map((s) => ({ time: shortTime(s.time), title: s.title, notes: s.notes ?? "" })),
        }}
      />
    </>
  );
}
