import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/db";
import { auditLogs, users } from "@/db/schema";
import {
  ForbiddenError,
  createAdmin,
  deleteAdmin,
  listAdmins,
  resetAdminPassword,
  setAdminActive,
} from "@/lib/admins/service";
import { authenticate, createSession, getSessionUser, type SessionUser } from "@/lib/auth/service";
import { createUser, ctx, resetDb } from "./helpers";

const asSession = (u: { id: number; name: string; username: string; role: SessionUser["role"] }): SessionUser => ({
  id: u.id,
  name: u.name,
  username: u.username,
  role: u.role,
});

describe("admin management", () => {
  let superAdmin: SessionUser;

  beforeEach(async () => {
    await resetDb();
    superAdmin = asSession(await createUser("super_admin", { username: "root" }));
  });

  it("super admin creates an admin who can then log in", async () => {
    expect((await createAdmin(superAdmin, { name: "Mona", username: "mona", password: "password123" }, ctx)).ok).toBe(true);
    expect((await authenticate("mona", "password123", ctx)).ok).toBe(true);
    const [row] = await db.select().from(users).where(eq(users.username, "mona"));
    expect(row.role).toBe("admin");
    expect(row.createdBy).toBe(superAdmin.id);
  });

  it("rejects duplicate usernames regardless of case", async () => {
    await createAdmin(superAdmin, { name: "Mona", username: "mona", password: "password123" }, ctx);
    const r = await createAdmin(superAdmin, { name: "Other", username: "MONA", password: "password123" }, ctx);
    expect(r.ok).toBe(false);
  });

  it("regular admins and supervisors cannot manage admins", async () => {
    const admin = asSession(await createUser("admin"));
    const supervisor = asSession(await createUser("supervisor"));
    const target = await createUser("admin");
    for (const actor of [admin, supervisor]) {
      await expect(createAdmin(actor, { name: "X", username: "xxx", password: "password123" }, ctx)).rejects.toThrow(ForbiddenError);
      await expect(setAdminActive(actor, target.id, false, ctx)).rejects.toThrow(ForbiddenError);
      await expect(deleteAdmin(actor, target.id, ctx)).rejects.toThrow(ForbiddenError);
      await expect(resetAdminPassword(actor, target.id, "password999", ctx)).rejects.toThrow(ForbiddenError);
    }
  });

  it("freezing kills open sessions immediately and unfreezing restores login", async () => {
    const target = await createUser("admin");
    const { token } = await createSession(target.id, ctx);

    expect((await setAdminActive(superAdmin, target.id, false, ctx)).ok).toBe(true);
    expect(await getSessionUser(token)).toBeNull();
    expect(await authenticate(target.username, "password123", ctx)).toMatchObject({ reason: "frozen" });

    await setAdminActive(superAdmin, target.id, true, ctx);
    expect((await authenticate(target.username, "password123", ctx)).ok).toBe(true);
  });

  it("delete is a soft delete that frees the username", async () => {
    const target = await createUser("admin", { username: "temp" });
    expect((await deleteAdmin(superAdmin, target.id, ctx)).ok).toBe(true);

    const [row] = await db.select().from(users).where(eq(users.id, target.id));
    expect(row.deletedAt).not.toBeNull();
    expect((await listAdmins()).map((a) => a.id)).not.toContain(target.id);
    expect((await createAdmin(superAdmin, { name: "New", username: "temp", password: "password123" }, ctx)).ok).toBe(true);
  });

  it("cannot target itself, another super admin, or a supervisor", async () => {
    const otherSuper = await createUser("super_admin");
    const supervisor = await createUser("supervisor");
    for (const id of [superAdmin.id, otherSuper.id, supervisor.id]) {
      expect((await setAdminActive(superAdmin, id, false, ctx)).ok).toBe(false);
      expect((await deleteAdmin(superAdmin, id, ctx)).ok).toBe(false);
      expect((await resetAdminPassword(superAdmin, id, "password999", ctx)).ok).toBe(false);
    }
  });

  it("password reset signs the admin out everywhere and is audited", async () => {
    const target = await createUser("admin");
    const { token } = await createSession(target.id, ctx);
    expect((await resetAdminPassword(superAdmin, target.id, "short", ctx)).ok).toBe(false);
    expect((await resetAdminPassword(superAdmin, target.id, "brand-new-pass", ctx)).ok).toBe(true);
    expect(await getSessionUser(token)).toBeNull();
    expect((await authenticate(target.username, "brand-new-pass", ctx)).ok).toBe(true);

    const actions = (await db.select().from(auditLogs)).map((l) => l.action);
    expect(actions).toContain("admin.password_reset");
  });
});
