import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/db";
import { activities, auditLogs } from "@/db/schema";
import type { SessionUser } from "@/lib/auth/service";
import { cairoToday } from "@/lib/dates";
import { ForbiddenError } from "@/lib/errors";
import {
  countTripsByStatus,
  createTrip,
  deleteTrip,
  getSchedule,
  getTrip,
  listTrips,
  updateTrip,
} from "@/lib/trips/service";
import { createUser, ctx, daysFromToday, resetDb, tripInput } from "./helpers";

describe("trips", () => {
  let admin: SessionUser;

  beforeEach(async () => {
    await resetDb();
    admin = await createUser("admin");
  });

  it("creates an upcoming trip with a unique public token and its schedule", async () => {
    const r = await createTrip(admin, tripInput(), ctx);
    expect(r.ok).toBe(true);
    if (!r.ok) return;

    const trip = await getTrip(r.id);
    expect(trip).toMatchObject({ status: "upcoming", type: "trip", bookingOpen: false, capacity: 50, createdBy: admin.id });
    expect(trip!.publicToken).toMatch(/^[A-Za-z0-9_-]{22}$/);

    const second = await createTrip(admin, tripInput(), ctx);
    if (second.ok) expect((await getTrip(second.id))!.publicToken).not.toBe(trip!.publicToken);

    const schedule = await getSchedule(r.id);
    expect(schedule.map((s) => [s.time, s.title, s.notes])).toEqual([
      ["06:30:00", "التجمع والتحرك", null],
      [null, "الغداء", "على الشاطئ"],
    ]);
    expect((await db.select().from(auditLogs)).map((l) => l.action)).toContain("activity.created");
  });

  it("validates input", async () => {
    const bad = await createTrip(
      admin,
      tripInput({ title: "x", capacity: 0, date: "2026-02-30", lateGraceMinutes: 500, startTime: "25:00" }),
      ctx,
    );
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(Object.keys(bad.errors).sort()).toEqual(["capacity", "date", "lateGraceMinutes", "startTime", "title"]);

    const past = await createTrip(admin, tripInput({ date: daysFromToday(-1) }), ctx);
    expect(past).toEqual({ ok: false, errors: { date: "التاريخ ده عدّى" } });
    expect((await createTrip(admin, tripInput({ date: cairoToday() }), ctx)).ok).toBe(true);
  });

  it("requires a fee amount when the fee is enabled, and drops fee options when it is not", async () => {
    const missing = await createTrip(admin, tripInput({ feeEnabled: true, feeAmount: "" }), ctx);
    expect(missing.ok).toBe(false);

    const paid = await createTrip(admin, tripInput({ feeEnabled: true, feeAmount: "350", paymentRequired: true }), ctx);
    if (paid.ok) expect(await getTrip(paid.id)).toMatchObject({ feeAmount: "350.00", paymentRequired: true });

    const free = await createTrip(admin, tripInput({ feeEnabled: false, feeAmount: "100", paymentRequired: true }), ctx);
    if (free.ok) expect(await getTrip(free.id)).toMatchObject({ feeAmount: null, paymentRequired: false });
  });

  it("updates fields and replaces the schedule", async () => {
    const r = await createTrip(admin, tripInput(), ctx);
    if (!r.ok) throw new Error();
    const u = await updateTrip(admin, r.id, tripInput({ title: "رحلة مطروح", schedule: [{ time: "08:00", title: "فطار" }] }), ctx);
    expect(u.ok).toBe(true);
    expect((await getTrip(r.id))!.title).toBe("رحلة مطروح");
    expect((await getSchedule(r.id)).map((s) => s.title)).toEqual(["فطار"]);

    const [log] = await db.select().from(auditLogs).where(eq(auditLogs.action, "activity.updated"));
    expect(log.meta).toEqual({ fields: ["title"] });
  });

  it("locks the date once a trip has started and blocks edits once finished", async () => {
    const r = await createTrip(admin, tripInput(), ctx);
    if (!r.ok) throw new Error();
    await db.update(activities).set({ status: "ongoing" }).where(eq(activities.id, r.id));
    expect((await updateTrip(admin, r.id, tripInput({ date: daysFromToday(20) }), ctx)).ok).toBe(false);
    expect((await updateTrip(admin, r.id, tripInput({ title: "تعديل أثناء الرحلة" }), ctx)).ok).toBe(true);

    await db.update(activities).set({ status: "finished" }).where(eq(activities.id, r.id));
    expect((await updateTrip(admin, r.id, tripInput(), ctx)).ok).toBe(false);
  });

  it("deletes only upcoming trips, cascading the schedule", async () => {
    const r = await createTrip(admin, tripInput(), ctx);
    const s = await createTrip(admin, tripInput(), ctx);
    if (!r.ok || !s.ok) throw new Error();

    await db.update(activities).set({ status: "ongoing" }).where(eq(activities.id, s.id));
    expect((await deleteTrip(admin, s.id, ctx)).ok).toBe(false);

    expect((await deleteTrip(admin, r.id, ctx)).ok).toBe(true);
    expect(await getTrip(r.id)).toBeNull();
    expect(await getSchedule(r.id)).toEqual([]);
  });

  it("lists trips by status in a sensible order", async () => {
    const later = await createTrip(admin, tripInput({ title: "later", date: daysFromToday(30) }), ctx);
    const sooner = await createTrip(admin, tripInput({ title: "sooner", date: daysFromToday(5) }), ctx);
    const done = await createTrip(admin, tripInput({ title: "done" }), ctx);
    if (!later.ok || !sooner.ok || !done.ok) throw new Error();
    await db.update(activities).set({ status: "finished" }).where(eq(activities.id, done.id));

    expect((await listTrips("upcoming")).map((t) => t.title)).toEqual(["sooner", "later"]);
    expect((await listTrips("finished")).map((t) => t.title)).toEqual(["done"]);
    expect(await countTripsByStatus()).toEqual({ upcoming: 2, ongoing: 0, finished: 1 });
  });

  it("supervisors cannot create, edit or delete trips", async () => {
    const r = await createTrip(admin, tripInput(), ctx);
    if (!r.ok) throw new Error();
    const sup = await createUser("supervisor");
    await expect(createTrip(sup, tripInput(), ctx)).rejects.toThrow(ForbiddenError);
    await expect(updateTrip(sup, r.id, tripInput(), ctx)).rejects.toThrow(ForbiddenError);
    await expect(deleteTrip(sup, r.id, ctx)).rejects.toThrow(ForbiddenError);
  });
});
