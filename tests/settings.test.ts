import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/db";
import { auditLogs, settings } from "@/db/schema";
import { seed } from "@/db/seed";
import { ForbiddenError } from "@/lib/errors";
import { DEFAULT_SETTINGS } from "@/lib/settings-definitions";
import { getSetting, getSettings, updateSettings } from "@/lib/settings/service";
import { createUser, ctx, resetDb } from "./helpers";

describe("general settings", () => {
  beforeEach(async () => {
    await resetDb();
    await seed(db);
  });

  it("returns defaults after seeding", async () => {
    expect(await getSettings()).toEqual(DEFAULT_SETTINGS);
  });

  it("super admin updates a setting and the change is audited with before/after", async () => {
    const sa = await createUser("super_admin");
    const r = await updateSettings(sa, { supervisor_trip_visibility: "all", restore_absent_student: "allowed" }, ctx);
    expect(r).toEqual({ ok: true, changed: 1 });
    expect(await getSetting("supervisor_trip_visibility")).toBe("all");

    const [log] = await db.select().from(auditLogs).where(eq(auditLogs.action, "settings.updated"));
    expect(log.meta).toEqual({ supervisor_trip_visibility: { from: "assigned", to: "all" } });
  });

  it("rejects unknown values and non-super-admins", async () => {
    const sa = await createUser("super_admin");
    expect((await updateSettings(sa, { student_login_non_confirmed: "maybe" }, ctx)).ok).toBe(false);
    expect(await getSetting("student_login_non_confirmed")).toBe("allowed");

    const admin = await createUser("admin");
    await expect(updateSettings(admin, { supervisor_trip_visibility: "all" }, ctx)).rejects.toThrow(ForbiddenError);
  });

  it("falls back to the default when a stored value is invalid", async () => {
    await db.update(settings).set({ value: "garbage" }).where(eq(settings.key, "duplicate_national_id_policy"));
    expect(await getSetting("duplicate_national_id_policy")).toBe("flag");
  });
});
