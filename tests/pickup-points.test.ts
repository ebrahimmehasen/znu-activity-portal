import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/db";
import { bookings } from "@/db/schema";
import { tripDashboard } from "@/lib/attendance/dashboard";
import { scanPack, startTrip } from "@/lib/attendance/service";
import { createSession, getSessionUser, type SessionUser } from "@/lib/auth/service";
import { addManualBooking, confirmBooking, listBookings, setBookingOpen, setPickupPoint, submitPublicBooking } from "@/lib/bookings/service";
import { ForbiddenError } from "@/lib/errors";
import { tripReport } from "@/lib/reports/service";
import { assignSupervisor } from "@/lib/supervisors/assignments";
import { createSupervisor } from "@/lib/supervisors/service";
import { createTrip, getTrip, listPickupPoints, updateTrip, type TripInput } from "@/lib/trips/service";
import { createFaculty, createUser, ctx, daysFromToday, resetDb, studentInput, tripInput } from "./helpers";

let admin: SessionUser;
let facultyId: number;

const twoPoints = [
  { name: "البوابة الرئيسية", time: "06:00" },
  { name: "موقف الزقازيق", time: "06:30" },
];

async function newTrip(overrides: Partial<TripInput> = {}) {
  const r = await createTrip(admin, tripInput({ pickupPoints: twoPoints, ...overrides }), ctx);
  if (!r.ok) throw new Error(JSON.stringify(r));
  return r.id;
}

const book = (token: string, n: number, pickupPointId?: unknown) =>
  submitPublicBooking(token, { ...studentInput(n, facultyId), pickupPointId }, { ip: `10.0.0.${n}`, userAgent: "vitest" });

const bookingOf = async (tripId: number) => (await db.select().from(bookings).where(eq(bookings.activityId, tripId)))[0];

beforeEach(async () => {
  await resetDb();
  admin = await createUser("admin");
  facultyId = (await createFaculty()).id;
});

describe("pickup points", () => {
  it("are saved with the trip and keep their ids when edited", async () => {
    const id = await newTrip();
    const [a, b] = await listPickupPoints(id);
    expect([a.name, b.name]).toEqual(["البوابة الرئيسية", "موقف الزقازيق"]);
    expect(a.time).toBe("06:00:00");

    // Rename the first, drop the second, add a third.
    const r = await updateTrip(admin, id, tripInput({ pickupPoints: [{ id: a.id, name: "البوابة الشمالية", time: "" }, { name: "محطة القطار", time: "07:00" }] }), ctx);
    expect(r.ok).toBe(true);
    const after = await listPickupPoints(id);
    expect(after.map((p) => [p.id === a.id, p.name, p.time])).toEqual([
      [true, "البوابة الشمالية", null],
      [false, "محطة القطار", "07:00:00"],
    ]);
  });

  it("must be chosen on the booking form when the trip has them, and must belong to the trip", async () => {
    const id = await newTrip();
    const other = await newTrip({ title: "رحلة أخرى" });
    await setBookingOpen(admin, id, true, ctx);
    const token = (await getTrip(id))!.publicToken;
    const [p1] = await listPickupPoints(id);
    const [foreign] = await listPickupPoints(other);

    expect(await book(token, 1)).toMatchObject({ ok: false, errors: { pickupPointId: "اختر مكان التجمع" } });
    expect(await book(token, 1, foreign.id)).toMatchObject({ ok: false, errors: { pickupPointId: "اختر مكان التجمع" } });
    expect(await book(token, 1, String(p1.id))).toMatchObject({ ok: true });
    expect((await bookingOf(id)).pickupPointId).toBe(p1.id);
  });

  it("aren't asked for when the trip has none", async () => {
    const id = await newTrip({ pickupPoints: [] });
    await setBookingOpen(admin, id, true, ctx);
    expect(await book((await getTrip(id))!.publicToken, 1)).toMatchObject({ ok: true });
    expect((await bookingOf(id)).pickupPointId).toBeNull();
  });

  it("are required for manual bookings too, and admins can change them later", async () => {
    const id = await newTrip();
    const [p1, p2] = await listPickupPoints(id);
    expect(await addManualBooking(admin, id, studentInput(1, facultyId), ctx)).toMatchObject({ ok: false, errors: { pickupPointId: "اختر مكان التجمع" } });
    const r = await addManualBooking(admin, id, { ...studentInput(1, facultyId), pickupPointId: p1.id }, ctx);
    if (!r.ok) throw new Error("manual");

    expect(await setPickupPoint(admin, r.bookingId, p2.id, ctx)).toEqual({ ok: true });
    expect((await bookingOf(id)).pickupPointId).toBe(p2.id);
    const foreignTrip = await newTrip({ title: "أخرى" });
    const [foreign] = await listPickupPoints(foreignTrip);
    expect((await setPickupPoint(admin, r.bookingId, foreign.id, ctx)).ok).toBe(false);

    const sup = await createSupervisor(admin, { name: "مشرف", username: "sup1", password: "password123", permissions: ["confirm_bookings"] }, ctx);
    if (!sup.ok) throw new Error("sup");
    await assignSupervisor(admin, id, sup.id!, ctx);
    const supUser = (await getSessionUser((await createSession(sup.id!, ctx)).token))!;
    await expect(setPickupPoint(supUser, r.bookingId, p1.id, ctx)).rejects.toThrow(ForbiddenError);
  });

  it("removing a point leaves its bookings without one", async () => {
    const id = await newTrip();
    const [p1, p2] = await listPickupPoints(id);
    await addManualBooking(admin, id, { ...studentInput(1, facultyId), pickupPointId: p1.id }, ctx);
    await updateTrip(admin, id, tripInput({ pickupPoints: [{ id: p2.id, name: p2.name, time: "" }] }), ctx);
    expect((await bookingOf(id)).pickupPointId).toBeNull();
  });

  it("shows in the bookings list, scanner data, trip overview and report", async () => {
    const id = await newTrip({ date: daysFromToday(0), startTime: "" });
    const [p1, p2] = await listPickupPoints(id);
    await addManualBooking(admin, id, { ...studentInput(1, facultyId), pickupPointId: p1.id }, ctx);
    await addManualBooking(admin, id, { ...studentInput(2, facultyId), pickupPointId: p2.id }, ctx);
    await setBookingOpen(admin, id, true, ctx);
    const pending = await book((await getTrip(id))!.publicToken, 3, p1.id);
    expect(pending.ok).toBe(true);

    const { rows } = await listBookings(id, { pickupPointId: p1.id });
    expect(rows.map((r) => r.pickupName)).toEqual(["البوابة الرئيسية", "البوابة الرئيسية"]);
    const [pendingRow] = (await listBookings(id, { status: "pending" })).rows;
    expect((await confirmBooking(admin, pendingRow.booking.id, ctx)).ok).toBe(true);

    await startTrip(admin, id, ctx);
    const trip = (await getTrip(id))!;
    const pack = await scanPack(admin, trip);
    expect(pack.students.map((s) => s.pickup).sort()).toEqual(["البوابة الرئيسية", "البوابة الرئيسية", "موقف الزقازيق"]);

    const d = await tripDashboard(admin, trip);
    expect(d.pickupGroups.map((g) => [g.label, g.count])).toEqual([
      ["البوابة الرئيسية", 2],
      ["موقف الزقازيق", 1],
    ]);

    const report = await tripReport(admin, trip);
    expect(report.showPickup).toBe(true);
    expect(report.rows.map((r) => r.pickup).sort()).toEqual(["البوابة الرئيسية", "البوابة الرئيسية", "موقف الزقازيق"]);
  });
});
