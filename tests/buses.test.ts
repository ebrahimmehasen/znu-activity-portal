import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/db";
import { activities, auditLogs } from "@/db/schema";
import type { SessionUser } from "@/lib/auth/service";
import { createBus, deleteBus, listBuses, updateBus } from "@/lib/buses/service";
import { ForbiddenError } from "@/lib/errors";
import { createTrip, deleteTrip } from "@/lib/trips/service";
import { createUser, ctx, resetDb, tripInput } from "./helpers";

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
});
