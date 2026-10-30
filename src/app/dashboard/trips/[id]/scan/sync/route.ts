import { MAX_SYNC_BATCH, syncAttendance } from "@/lib/attendance/service";
import { ForbiddenError } from "@/lib/errors";
import { json, sameOrigin, scannerAccess } from "../access";

/**
 * Uploads queued scans. A plain route (not a Server Action) so a page cached for offline
 * use keeps syncing after a new deployment.
 */
export async function POST(req: Request, ctx: RouteContext<"/dashboard/trips/[id]/scan/sync">) {
  if (!sameOrigin(req)) return json({ error: "forbidden" }, 403);
  const a = await scannerAccess((await ctx.params).id);
  if ("error" in a) return a.error;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return json({ error: "bad request" }, 400);
  }
  const records = (body as { records?: unknown })?.records;
  if (!Array.isArray(records) || records.length > MAX_SYNC_BATCH) return json({ error: "bad request" }, 400);

  try {
    const r = await syncAttendance(a.actor, a.trip.id, records);
    if (!r.ok) return json({ error: r.error }, 400);
    return json({ outcomes: r.outcomes });
  } catch (e) {
    if (e instanceof ForbiddenError) return json({ error: "forbidden" }, 403);
    throw e;
  }
}
