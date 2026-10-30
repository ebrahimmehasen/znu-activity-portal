import "server-only";
import { getCurrentUser } from "@/lib/auth/session";
import { can } from "@/lib/authz";
import { canViewTrip } from "@/lib/supervisors/scope";
import { getTrip } from "@/lib/trips/service";

const headers = { "Cache-Control": "no-store" };
export const json = (body: unknown, status = 200) => Response.json(body, { status, headers });

/** The scanner's JSON routes: 401 when signed out (the app keeps its queue), 404 otherwise. */
export async function scannerAccess(rawId: string) {
  const actor = await getCurrentUser();
  if (!actor) return { error: json({ error: "unauthorized" }, 401) } as const;
  const id = Number(rawId);
  const trip = Number.isInteger(id) ? await getTrip(id) : null;
  if (!trip || !(can(actor, "take_attendance") || can(actor, "manage_activities")) || !(await canViewTrip(actor, trip.id))) {
    return { error: json({ error: "not found" }, 404) } as const;
  }
  return { actor, trip } as const;
}

/**
 * Route Handlers don't get the Server Actions origin check, so state-changing ones verify
 * that the request comes from this site (the session cookie is SameSite=Lax as well).
 */
export function sameOrigin(req: Request) {
  const origin = req.headers.get("origin");
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  if (!origin || !host) return false;
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}
