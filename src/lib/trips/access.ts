import "server-only";
import { notFound } from "next/navigation";
import { requireAbility } from "@/lib/auth/session";
import { canViewTrip } from "@/lib/supervisors/scope";
import { getTrip } from "./service";

/** Trip pages: a trip the actor may not see responds 404, same as a missing one. */
export async function requireVisibleTrip(rawId: string) {
  const actor = await requireAbility("view_trips");
  const id = Number(rawId);
  const trip = Number.isInteger(id) ? await getTrip(id) : null;
  if (!trip || !(await canViewTrip(actor, trip.id))) notFound();
  return { actor, trip };
}
