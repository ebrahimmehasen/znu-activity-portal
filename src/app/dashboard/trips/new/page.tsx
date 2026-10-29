import type { Metadata } from "next";
import { PageHeader } from "@/components/ui";
import { requireAbility } from "@/lib/auth/session";
import { TripForm } from "../trip-form";

export const metadata: Metadata = { title: "رحلة جديدة" };

export default async function NewTripPage() {
  await requireAbility("manage_activities");
  return (
    <>
      <PageHeader title="رحلة جديدة" />
      <TripForm
        initial={{
          title: "",
          description: "",
          date: "",
          startTime: "",
          endTime: "",
          location: "",
          capacity: "",
          whenFull: "close",
          waitlistPromotion: "auto",
          feeEnabled: false,
          feeAmount: "",
          paymentRequired: false,
          lateGraceMinutes: "10",
          busesEnabled: false,
          supervisorScope: "bus",
          schedule: [],
        }}
      />
    </>
  );
}
