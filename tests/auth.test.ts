import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/db";
import { auditLogs, sessions, users } from "@/db/schema";
import {
  LOGIN_LIMITS,
  authenticate,
  changeOwnPassword,
  createSession,
  deleteSession,
  getSessionUser,
} from "@/lib/auth/service";
import { createUser, ctx, resetDb } from "./helpers";

describe("authenticate", () => {
  beforeEach(resetDb);

  it("accepts valid credentials case-insensitively on the username", async () => {
    const u = await createUser("admin", { username: "Ahmed" });
    const r = await authenticate("ahmed", "password123", ctx);
    expect(r).toEqual({ ok: true, user: { id: u.id, name: u.name, username: "Ahmed", role: "admin" } });
  });

  it("returns the same error for an unknown user and a wrong password", async () => {
    await createUser("admin", { username: "ahmed" });
    expect(await authenticate("nobody", "password123", ctx)).toEqual({ ok: false, reason: "invalid" });
    expect(await authenticate("ahmed", "wrong-pass", ctx)).toEqual({ ok: false, reason: "invalid" });
  });

  it("locks a username for 15 minutes after 5 failures, even with the right password", async () => {
    await createUser("admin", { username: "ahmed" });
    for (let i = 0; i < LOGIN_LIMITS.perUsername - 1; i++) {
      expect((await authenticate("ahmed", "nope", ctx)).ok).toBe(false);
    }
    const fifth = await authenticate("ahmed", "nope", ctx);
    expect(fifth).toMatchObject({ ok: false, reason: "locked" });

    const r = await authenticate("ahmed", "password123", ctx);
    expect(r).toMatchObject({ ok: false, reason: "locked" });
    if (!r.ok && r.reason === "locked") expect(r.retryAfterSeconds).toBeGreaterThan(14 * 60);

    const actions = (await db.select().from(auditLogs)).map((l) => l.action);
    expect(actions).toContain("auth.login_locked");
  });

  it("locks an IP that sprays many usernames", async () => {
    for (let i = 0; i < LOGIN_LIMITS.perIp; i++) await authenticate(`user${i}`, "x", ctx);
    await createUser("admin", { username: "real" });
    expect(await authenticate("real", "password123", ctx)).toMatchObject({ reason: "locked" });
    expect((await authenticate("real", "password123", { ...ctx, ip: "10.0.0.9" })).ok).toBe(true);
  });

  it("refuses frozen and soft-deleted accounts", async () => {
    await createUser("admin", { username: "frozen", isActive: false });
    expect(await authenticate("frozen", "password123", ctx)).toEqual({ ok: false, reason: "frozen" });

    const del = await createUser("admin", { username: "gone" });
    await db.update(users).set({ deletedAt: new Date() }).where(eq(users.id, del.id));
    expect(await authenticate("gone", "password123", ctx)).toEqual({ ok: false, reason: "invalid" });
  });
});

describe("sessions", () => {
  beforeEach(resetDb);

  it("stores only a hash of the token and resolves the user", async () => {
    const u = await createUser("admin");
    const { token } = await createSession(u.id, ctx);
    const [row] = await db.select().from(sessions);
    expect(row.id).not.toBe(token);
    expect((await getSessionUser(token))?.id).toBe(u.id);
    expect(await getSessionUser("forged-token")).toBeNull();
  });

  it("stops resolving immediately when the account is frozen or deleted", async () => {
    const u = await createUser("admin");
    const { token } = await createSession(u.id, ctx);
    await db.update(users).set({ isActive: false }).where(eq(users.id, u.id));
    expect(await getSessionUser(token)).toBeNull();

    await db.update(users).set({ isActive: true, deletedAt: new Date() }).where(eq(users.id, u.id));
    expect(await getSessionUser(token)).toBeNull();
  });

  it("rejects expired sessions and logs out", async () => {
    const u = await createUser("admin");
    const { token } = await createSession(u.id, ctx);
    await db.update(sessions).set({ expiresAt: new Date(Date.now() - 1000) });
    expect(await getSessionUser(token)).toBeNull();

    const second = await createSession(u.id, ctx);
    await deleteSession(second.token);
    expect(await getSessionUser(second.token)).toBeNull();
  });

  it("changing the password keeps this device and signs out the others", async () => {
    const u = await createUser("admin");
    const here = await createSession(u.id, ctx);
    const other = await createSession(u.id, ctx);

    expect((await changeOwnPassword(u.id, "wrong", "newpassword1", here.token, ctx)).ok).toBe(false);
    expect((await changeOwnPassword(u.id, "password123", "newpassword1", here.token, ctx)).ok).toBe(true);

    expect(await getSessionUser(here.token)).not.toBeNull();
    expect(await getSessionUser(other.token)).toBeNull();
    expect((await authenticate(u.username, "newpassword1", ctx)).ok).toBe(true);
  });
});
