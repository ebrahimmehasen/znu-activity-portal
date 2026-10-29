import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/db";
import { auditLogs, faculties, settings, users } from "@/db/schema";
import { FACULTIES, seed } from "@/db/seed";
import { verifyPassword } from "@/lib/password";
import { DEFAULT_SETTINGS } from "@/lib/settings-definitions";
import { resetDb } from "./helpers";

const superAdmin = { username: "root", password: "very-secret-1", name: "Root" };

describe("seed", () => {
  beforeEach(resetDb);

  it("creates the seven faculties, default settings and the super admin", async () => {
    const result = await seed(db, { superAdmin });
    expect(result.superAdminCreated).toBe(true);

    const facs = await db.select().from(faculties).orderBy(faculties.sortOrder);
    expect(facs.map((f) => f.name)).toEqual(FACULTIES);

    const rows = await db.select().from(settings);
    expect(Object.fromEntries(rows.map((r) => [r.key, r.value]))).toEqual(DEFAULT_SETTINGS);

    const [admin] = await db.select().from(users).where(eq(users.role, "super_admin"));
    expect(admin.username).toBe("root");
    expect(admin.passwordHash).not.toContain("very-secret-1");
    expect(await verifyPassword("very-secret-1", admin.passwordHash)).toBe(true);

    const logs = await db.select().from(auditLogs);
    expect(logs.map((l) => l.action)).toContain("user.super_admin_seeded");
  });

  it("is idempotent and never overwrites edited values", async () => {
    await seed(db, { superAdmin });
    await db.update(settings).set({ value: "update" }).where(eq(settings.key, "duplicate_national_id_policy"));
    await seed(db, { superAdmin: { ...superAdmin, username: "another" } });

    expect(await db.$count(faculties)).toBe(7);
    expect(await db.$count(users)).toBe(1);
    const [row] = await db.select().from(settings).where(eq(settings.key, "duplicate_national_id_policy"));
    expect(row.value).toBe("update");
  });

  it("rejects a weak super admin password", async () => {
    await expect(seed(db, { superAdmin: { ...superAdmin, password: "short" } })).rejects.toThrow();
  });
});
