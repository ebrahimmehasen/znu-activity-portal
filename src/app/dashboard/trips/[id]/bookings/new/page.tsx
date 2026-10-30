import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Card, PageHeader } from "@/components/ui";
import { requireAbility } from "@/lib/auth/session";
import { listFaculties } from "@/lib/faculties/service";
import { canViewTrip } from "@/lib/supervisors/scope";
import { getTrip } from "@/lib/trips/service";
import { addManualAction } from "../actions";
import { ManualBookingForm } from "./manual-form";

export const metadata: Metadata = { title: "إضافة طالب" };

export default async function NewBookingPage({ params }: PageProps<"/dashboard/trips/[id]/bookings/new">) {
  const actor = await requireAbility("add_students");
  const id = Number((await params).id);
  const trip = Number.isInteger(id) ? await getTrip(id) : null;
  if (!trip || trip.status === "finished" || !(await canViewTrip(actor, trip.id))) notFound();
  const faculties = await listFaculties({ activeOnly: true });

  return (
    <>
      <PageHeader
        title="إضافة طالب يدويًا"
        description={`${trip.title} — الطالب بيدخل كحجز مؤكد مباشرة.`}
        actions={
          <Link href={`/dashboard/trips/${trip.id}/bookings`} className="rounded-lg border border-border bg-surface px-4 py-2.5 text-sm font-semibold">
            الحجوزات
          </Link>
        }
      />
      <Card className="max-w-2xl">
        <ManualBookingForm
          action={addManualAction.bind(null, trip.id)}
          faculties={faculties}
          feeAmount={trip.feeEnabled && actor.role !== "supervisor" ? Number(trip.feeAmount) : null}
          paymentRequired={trip.paymentRequired}
          canOverrideSameDay={actor.role !== "supervisor"}
        />
      </Card>
    </>
  );
}
