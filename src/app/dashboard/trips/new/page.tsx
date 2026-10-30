import type { Metadata } from "next";
import { getT } from "@/i18n/server";
import { PageHeader } from "@/components/ui";
import { requireAbility } from "@/lib/auth/session";
import { TripForm } from "../trip-form";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getT())("رحلة جديدة") };
}

export default async function NewTripPage() {
  await requireAbility("manage_activities");
  const t = await getT();
  return (
    <>
      <PageHeader title={t("رحلة جديدة")} />
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
