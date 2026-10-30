import { staffUnreadCount } from "@/lib/announcements/service";
import { getCurrentUser } from "@/lib/auth/session";

/** Polled by the unread badge in the dashboard header. */
export async function GET() {
  const headers = { "Cache-Control": "no-store" };
  const actor = await getCurrentUser();
  if (!actor) return Response.json({ error: "unauthorized" }, { status: 401, headers });
  return Response.json({ count: await staffUnreadCount(actor) }, { headers });
}
