import { createHash, randomBytes } from "node:crypto";
import { and, eq, gt, isNull, lt, ne, sql } from "drizzle-orm";
import { db } from "@/db";
import { sessions, users, type User } from "@/db/schema";
import { recordAudit, type RequestCtx } from "@/lib/audit";
import { hashPassword, verifyAgainstDummy, verifyPassword } from "@/lib/password";
import { clearFailures, lockedFor, registerFailure } from "@/lib/rate-limit";

export const SESSION_TTL_SECONDS = 7 * 24 * 60 * 60;

export const LOGIN_LIMITS = {
  perUsername: 5,
  perIp: 20,
  windowSeconds: 15 * 60,
  lockSeconds: 15 * 60,
};

export type SessionUser = Pick<User, "id" | "name" | "username" | "role">;

type AuthResult =
  | { ok: true; user: SessionUser }
  | { ok: false; reason: "invalid" | "frozen" }
  | { ok: false; reason: "locked"; retryAfterSeconds: number };

const userKey = (username: string) => `login:user:${username.trim().toLowerCase()}`;
const ipKey = (ip: string | null) => `login:ip:${ip ?? "unknown"}`;

export function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export async function findActiveUserByUsername(username: string) {
  const [user] = await db
    .select()
    .from(users)
    .where(and(sql`lower(${users.username}) = ${username.trim().toLowerCase()}`, isNull(users.deletedAt)));
  return user;
}

export async function authenticate(username: string, password: string, ctx: RequestCtx): Promise<AuthResult> {
  const keys = [
    { key: userKey(username), limit: LOGIN_LIMITS.perUsername },
    { key: ipKey(ctx.ip), limit: LOGIN_LIMITS.perIp },
  ];

  for (const { key, limit } of keys) {
    const wait = await lockedFor(key, limit);
    if (wait > 0) return { ok: false, reason: "locked", retryAfterSeconds: wait };
  }

  const user = await findActiveUserByUsername(username);
  const valid = user ? await verifyPassword(password, user.passwordHash) : await verifyAgainstDummy(password);

  if (!user || !valid) {
    let locked = false;
    for (const { key, limit } of keys) {
      const r = await registerFailure(key, limit, LOGIN_LIMITS.windowSeconds, LOGIN_LIMITS.lockSeconds);
      locked ||= r.locked;
    }
    await recordAudit(
      {
        actor: user ? { type: "user", id: user.id } : null,
        action: locked ? "auth.login_locked" : "auth.login_failed",
        subjectType: "user",
        subjectId: user?.id,
        meta: { username: username.slice(0, 50) },
      },
      ctx,
    );
    if (locked) return { ok: false, reason: "locked", retryAfterSeconds: LOGIN_LIMITS.lockSeconds };
    return { ok: false, reason: "invalid" };
  }

  if (!user.isActive) {
    await recordAudit({ actor: { type: "user", id: user.id }, action: "auth.login_frozen", subjectType: "user", subjectId: user.id }, ctx);
    return { ok: false, reason: "frozen" };
  }

  await clearFailures(userKey(username));
  await recordAudit({ actor: { type: "user", id: user.id }, action: "auth.login", subjectType: "user", subjectId: user.id }, ctx);
  return { ok: true, user: { id: user.id, name: user.name, username: user.username, role: user.role } };
}

/** Returns the raw token for the cookie; only its hash is stored. */
export async function createSession(userId: number, ctx: RequestCtx) {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + SESSION_TTL_SECONDS * 1000);
  await db.delete(sessions).where(and(eq(sessions.userId, userId), lt(sessions.expiresAt, sql`now()`)));
  await db.insert(sessions).values({
    id: hashToken(token),
    userId,
    expiresAt,
    ip: ctx.ip,
    userAgent: ctx.userAgent?.slice(0, 500) ?? null,
  });
  return { token, expiresAt };
}

/** Frozen, deleted or expired accounts resolve to null immediately — no cached session survives. */
export async function getSessionUser(token: string): Promise<SessionUser | null> {
  const [row] = await db
    .select({ id: users.id, name: users.name, username: users.username, role: users.role })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .where(
      and(
        eq(sessions.id, hashToken(token)),
        gt(sessions.expiresAt, sql`now()`),
        eq(users.isActive, true),
        isNull(users.deletedAt),
      ),
    );
  return row ?? null;
}

export async function deleteSession(token: string) {
  await db.delete(sessions).where(eq(sessions.id, hashToken(token)));
}

export async function deleteUserSessions(userId: number, exceptToken?: string) {
  await db
    .delete(sessions)
    .where(
      exceptToken
        ? and(eq(sessions.userId, userId), ne(sessions.id, hashToken(exceptToken)))
        : eq(sessions.userId, userId),
    );
}

export async function changeOwnPassword(
  userId: number,
  currentPassword: string,
  newPassword: string,
  currentToken: string,
  ctx: RequestCtx,
) {
  const [user] = await db.select().from(users).where(eq(users.id, userId));
  if (!user || !(await verifyPassword(currentPassword, user.passwordHash))) return { ok: false as const };
  await db.update(users).set({ passwordHash: await hashPassword(newPassword) }).where(eq(users.id, userId));
  // Sign out every other device that knew the old password.
  await deleteUserSessions(userId, currentToken);
  await recordAudit({ actor: { type: "user", id: userId }, action: "auth.password_changed", subjectType: "user", subjectId: userId }, ctx);
  return { ok: true as const };
}
