"use server";

import { redirect } from "next/navigation";
import { recordAudit } from "@/lib/audit";
import { deleteSession } from "@/lib/auth/service";
import { clearSessionCookie, getCurrentUser, getRequestCtx, getSessionToken } from "@/lib/auth/session";

export async function logout() {
  const token = await getSessionToken();
  const user = await getCurrentUser();
  if (token) await deleteSession(token);
  if (user) await recordAudit({ actor: { type: "user", id: user.id }, action: "auth.logout" }, await getRequestCtx());
  await clearSessionCookie();
  redirect("/login");
}
