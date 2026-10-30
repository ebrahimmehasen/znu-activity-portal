import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Scanner } from "@/components/attendance/scanner";
import { can } from "@/lib/authz";
import { requireVisibleTrip } from "@/lib/trips/access";

export const metadata: Metadata = { title: "Scan الحضور" };

/**
 * Kept by the service worker for offline use, so the server renders no roster data:
 * the scanner reads the trip copy saved on the phone and refreshes it when online.
 */
export default async function ScanPage({ params }: PageProps<"/dashboard/trips/[id]/scan">) {
  const { actor, trip } = await requireVisibleTrip((await params).id);
  if (!can(actor, "take_attendance") && !can(actor, "manage_activities")) notFound();
  return <Scanner tripId={trip.id} />;
}
