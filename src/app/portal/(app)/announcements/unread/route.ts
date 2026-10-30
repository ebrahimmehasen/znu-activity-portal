import { studentUnreadCount } from "@/lib/announcements/service";
import { getCurrentStudent } from "@/lib/students/session";

/** Polled by the unread badge in the portal header. */
export async function GET() {
  const headers = { "Cache-Control": "no-store" };
  const student = await getCurrentStudent();
  if (!student) return Response.json({ error: "unauthorized" }, { status: 401, headers });
  return Response.json({ count: await studentUnreadCount(student.id) }, { headers });
}
