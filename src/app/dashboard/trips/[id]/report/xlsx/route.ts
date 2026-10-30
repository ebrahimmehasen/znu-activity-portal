import { recordAudit } from "@/lib/audit";
import { getCurrentUser, getRequestCtx } from "@/lib/auth/session";
import { can } from "@/lib/authz";
import { tripReport } from "@/lib/reports/service";
import { reportWorkbook } from "@/lib/reports/xlsx";
import { getTrip } from "@/lib/trips/service";
import { getLocale } from "@/i18n/server";

/** The trip report as an Excel file (admins only); every download is audited. */
export async function GET(_req: Request, ctx: RouteContext<"/dashboard/trips/[id]/report/xlsx">) {
  const actor = await getCurrentUser();
  if (!actor) return new Response("unauthorized", { status: 401 });
  const id = Number((await ctx.params).id);
  const trip = Number.isInteger(id) ? await getTrip(id) : null;
  if (!trip || !can(actor, "manage_activities")) return new Response("not found", { status: 404 });

  const body = await reportWorkbook(await tripReport(actor, trip, await getLocale()));
  await recordAudit(
    { actor: { type: "user", id: actor.id }, action: "report.exported", subjectType: "activity", subjectId: trip.id, meta: { format: "xlsx" } },
    await getRequestCtx(),
  );
  const name = `${trip.title} - ${trip.date}.xlsx`.replace(/[\\/:*?"<>|]/g, "_");
  return new Response(new Uint8Array(body), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="trip-${trip.id}.xlsx"; filename*=UTF-8''${encodeURIComponent(name)}`,
      "Cache-Control": "no-store",
    },
  });
}
