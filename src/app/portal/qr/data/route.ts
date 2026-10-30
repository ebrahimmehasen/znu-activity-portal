import { offlineQrData } from "@/lib/students/auth";
import { getCurrentStudent } from "@/lib/students/session";

/** The phone's offline QR set. Never cached by the browser or the service worker. */
export async function GET() {
  const student = await getCurrentStudent();
  const headers = { "Cache-Control": "no-store" };
  if (!student) return Response.json({ error: "unauthorized" }, { status: 401, headers });
  return Response.json({ name: student.name, bookings: await offlineQrData(student.id) }, { headers });
}
