import "server-only";
import { cookies, headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { cache } from "react";
import type { RequestCtx } from "@/lib/audit";
import { can, type Ability } from "@/lib/authz";
import { SESSION_TTL_SECONDS, getSessionUser } from "./service";

export const SESSION_COOKIE = "znu_session";

export async function getRequestCtx(): Promise<RequestCtx> {
  const h = await headers();
  const forwarded = h.get("x-forwarded-for")?.split(",")[0]?.trim();
  return { ip: forwarded || h.get("x-real-ip") || null, userAgent: h.get("user-agent") };
}

export async function setSessionCookie(token: string) {
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_TTL_SECONDS,
  });
}

export async function getSessionToken() {
  return (await cookies()).get(SESSION_COOKIE)?.value ?? null;
}

export async function clearSessionCookie() {
  (await cookies()).delete(SESSION_COOKIE);
}

/** Per-request memoized: every page, layout and action re-checks against the DB. */
export const getCurrentUser = cache(async () => {
  const token = await getSessionToken();
  return token ? getSessionUser(token) : null;
});

export async function requireUser() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}

/** Pages a user may not access respond 404 so their existence isn't revealed. */
export async function requireAbility(ability: Ability) {
  const user = await requireUser();
  if (!can(user, ability)) notFound();
  return user;
}
