import { scanPack } from "@/lib/attendance/service";
import { json, scannerAccess } from "../access";

/** The trip copy for offline scanning: names and gatherings, no national IDs or QR secrets. */
export async function GET(_req: Request, ctx: RouteContext<"/dashboard/trips/[id]/scan/data">) {
  const a = await scannerAccess((await ctx.params).id);
  if ("error" in a) return a.error;
  return json(await scanPack(a.actor, a.trip));
}
