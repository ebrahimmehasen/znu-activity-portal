import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/db";
import { activities, auditLogs } from "@/db/schema";
import type { SessionUser } from "@/lib/auth/service";
import { addManualBooking, cancelBooking, listBookings } from "@/lib/bookings/service";
import { assignBus, autoAssignBuses, createBus, deleteBus, listBusLoad, listBuses, updateBus } from "@/lib/buses/service";
import { ForbiddenError } from "@/lib/errors";
import { createTrip, deleteTrip } from "@/lib/trips/service";
import { createFaculty, createUser, ctx, resetDb, studentInput, tripInput } from "./helpers";

describe("buses", () => {
  let admin: SessionUser;
  let tripId: number;

  beforeEach(async () => {
    await resetDb();
    admin = await createUser("admin");
    const r = await createTrip(admin, tripInput({ busesEnabled: true }), ctx);
    if (!r.ok) throw new Error("trip");
    tripId = r.id;
  });

  it("adds, edits and deletes buses with audit entries", async () => {
    expect((await createBus(admin, tripId, { name: "أتوبيس 1", capacity: 50 }, ctx)).ok).toBe(true);
    const [bus] = await listBuses(tripId);
    expect(bus).toMatchObject({ name: "أتوبيس 1", capacity: 50 });

    expect((await updateBus(admin, bus.id, { name: "أتوبيس البنات", capacity: 45 }, ctx)).ok).toBe(true);
    expect((await listBuses(tripId))[0]).toMatchObject({ name: "أتوبيس البنات", capacity: 45 });

    expect((await deleteBus(admin, bus.id, ctx)).ok).toBe(true);
    expect(await listBuses(tripId)).toEqual([]);

    const actions = (await db.select().from(auditLogs)).map((l) => l.action);
    expect(actions).toEqual(expect.arrayContaining(["bus.created", "bus.updated", "bus.deleted"]));
  });

  it("validates name uniqueness per trip and capacity", async () => {
    await createBus(admin, tripId, { name: "Bus A", capacity: 50 }, ctx);
    expect((await createBus(admin, tripId, { name: "bus a", capacity: 50 }, ctx)).ok).toBe(false);
    expect((await createBus(admin, tripId, { name: "Bus B", capacity: 0 }, ctx)).ok).toBe(false);
    expect((await createBus(admin, tripId, { name: "Bus B", capacity: 500 }, ctx)).ok).toBe(false);

    const other = await createTrip(admin, tripInput({ busesEnabled: true }), ctx);
    if (other.ok) expect((await createBus(admin, other.id, { name: "Bus A", capacity: 50 }, ctx)).ok).toBe(true);
  });

  it("refuses buses when the trip has them disabled or is finished", async () => {
    const plain = await createTrip(admin, tripInput({ busesEnabled: false }), ctx);
    if (plain.ok) expect((await createBus(admin, plain.id, { name: "X", capacity: 10 }, ctx)).ok).toBe(false);

    await createBus(admin, tripId, { name: "X", capacity: 10 }, ctx);
    const [bus] = await listBuses(tripId);
    await db.update(activities).set({ status: "finished" }).where(eq(activities.id, tripId));
    expect((await createBus(admin, tripId, { name: "Y", capacity: 10 }, ctx)).ok).toBe(false);
    expect((await updateBus(admin, bus.id, { name: "Z", capacity: 10 }, ctx)).ok).toBe(false);
    expect((await deleteBus(admin, bus.id, ctx)).ok).toBe(false);
  });

  it("deleting a trip removes its buses", async () => {
    await createBus(admin, tripId, { name: "X", capacity: 10 }, ctx);
    await deleteTrip(admin, tripId, ctx);
    expect(await listBuses(tripId)).toEqual([]);
  });

  it("supervisors cannot manage buses", async () => {
    const sup = await createUser("supervisor");
    await expect(createBus(sup, tripId, { name: "X", capacity: 10 }, ctx)).rejects.toThrow(ForbiddenError);
  });

  describe("distributing students", () => {
    async function confirmedStudents(n: number) {
      const facultyId = (await createFaculty()).id;
      for (let i = 1; i <= n; i++) await addManualBooking(admin, tripId, studentInput(i, facultyId), ctx);
      return (await listBookings(tripId)).rows.map((r) => r.booking);
    }

    it("assigns one student, respecting bus capacity", async () => {
      await createBus(admin, tripId, { name: "A", capacity: 1 }, ctx);
      const [bus] = await listBuses(tripId);
      const [b1, b2] = await confirmedStudents(2);
      expect((await assignBus(admin, b1.id, bus.id, ctx)).ok).toBe(true);
      expect(await assignBus(admin, b2.id, bus.id, ctx)).toEqual({ ok: false, error: "A مليان" });
      expect((await assignBus(admin, b1.id, null, ctx)).ok).toBe(true);
      expect((await assignBus(admin, b2.id, bus.id, ctx)).ok).toBe(true);
    });

    it("auto-fills free seats and reports who is left", async () => {
      await createBus(admin, tripId, { name: "A", capacity: 2 }, ctx);
      await createBus(admin, tripId, { name: "B", capacity: 2 }, ctx);
      await confirmedStudents(5);
      expect(await autoAssignBuses(admin, tripId, ctx)).toEqual({ ok: true, assigned: 4, left: 1 });
      expect((await listBusLoad(tripId)).map((b) => b.used)).toEqual([2, 2]);
      expect((await listBookings(tripId, { busId: "none" })).rows).toHaveLength(1);
    });

    it("only seats confirmed students and frees the seat on cancel", async () => {
      await createBus(admin, tripId, { name: "A", capacity: 5 }, ctx);
      const [bus] = await listBuses(tripId);
      const [b] = await confirmedStudents(1);
      await assignBus(admin, b.id, bus.id, ctx);
      await cancelBooking(admin, b.id, ctx);
      expect((await listBusLoad(tripId))[0].used).toBe(0);
      expect((await assignBus(admin, b.id, bus.id, ctx)).ok).toBe(false);
    });
  });
});
