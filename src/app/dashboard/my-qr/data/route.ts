import { getCurrentUser } from "@/lib/auth/session";
import { ensureUserSecret } from "@/lib/qr/secrets";

/** The supervisor's QR secret for offline use. Never cached. */
export async function GET() {
  const headers = { "Cache-Control": "no-store" };
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "unauthorized" }, { status: 401, headers });
  if (user.role !== "supervisor") return Response.json({ error: "not found" }, { status: 404, headers });
  const secret = await ensureUserSecret(user.id);
  return Response.json({ userId: user.id, name: user.name, secret }, { headers });
}
