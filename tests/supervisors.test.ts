import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/db";
import { activitySupervisors, auditLogs, type SupervisorPermission } from "@/db/schema";
import { authenticate, createSession, getSessionUser, type SessionUser } from "@/lib/auth/service";
import { can } from "@/lib/authz";
import { addManualBooking, cancelBooking, confirmBooking, listBookings, setBookingOpen, submitPublicBooking } from "@/lib/bookings/service";
import { assignBus, createBus, listBuses } from "@/lib/buses/service";
import { ForbiddenError } from "@/lib/errors";
import { updateSettings } from "@/lib/settings/service";
import { assignSupervisor, listTripSupervisors, setSupervisorBus, unassignSupervisor } from "@/lib/supervisors/assignments";
import { bookingScope, canViewTrip, visibleTripsCondition } from "@/lib/supervisors/scope";
import {
  createSupervisor,
  deleteSupervisor,
  listSupervisors,
  resetSupervisorPassword,
  setSupervisorActive,
  setSupervisorPermissions,
} from "@/lib/supervisors/service";
import { createTrip, getTrip, listTrips, type TripInput } from "@/lib/trips/service";
import { createFaculty, createUser, ctx, resetDb, studentInput, tripInput } from "./helpers";

describe("supervisors", () => {
  let admin: SessionUser;
  let facultyId: number;

  async function newSupervisor(permissions: SupervisorPermission[] = [], username = `sup${Math.random().toString(36).slice(2, 7)}`) {
    const r = await createSupervisor(admin, { name: "مشرف تجربة", username, password: "password123", permissions }, ctx);
    if (!r.ok) throw new Error(r.error);
    const { token } = await createSession(r.id!, ctx);
    return { id: r.id!, token, session: async () => (await getSessionUser(token))! };
  }

  async function openTrip(overrides: Partial<TripInput> = {}) {
    const r = await createTrip(admin, tripInput(overrides), ctx);
    if (!r.ok) throw new Error("trip");
    await setBookingOpen(admin, r.id, true, ctx);
    return (await getTrip(r.id))!;
  }

  const book = (token: string, n: number) => submitPublicBooking(token, studentInput(n, facultyId), ctx);

  beforeEach(async () => {
    await resetDb();
    admin = await createUser("admin");
    facultyId = (await createFaculty()).id;
  });

  describe("accounts", () => {
    it("creates a supervisor with permissions that load into the session", async () => {
      const s = await newSupervisor(["confirm_bookings", "add_students"]);
      const me = await s.session();
      expect(me.role).toBe("supervisor");
      expect(me.permissions?.sort()).toEqual(["add_students", "confirm_bookings"]);
      expect(can(me, "confirm_bookings")).toBe(true);
      expect(can(me, "cancel_bookings")).toBe(false);
      expect(can(me, "view_trips")).toBe(true);
      expect(can(me, "manage_activities")).toBe(false);
      expect(can(me, "see_national_id")).toBe(false);

      const [row] = await listSupervisors();
      expect(row.permissions.sort()).toEqual(["add_students", "confirm_bookings"]);
    });

    it("rejects duplicate usernames, including admins'", async () => {
      await newSupervisor([], "ali");
      expect(await createSupervisor(admin, { name: "تاني", username: "ALI", password: "password123" }, ctx)).toEqual({
        ok: false,
        error: "اليوزر ده مستخدم قبل كده",
      });
      expect((await createSupervisor(admin, { name: "تاني", username: admin.username, password: "password123" }, ctx)).ok).toBe(false);
    });

    it("only admins manage supervisors", async () => {
      const s = await newSupervisor(["add_students"]);
      await expect(createSupervisor(await s.session(), { name: "x", username: "xyz", password: "password123" }, ctx)).rejects.toThrow(
        ForbiddenError,
      );
      await expect(setSupervisorPermissions(await s.session(), s.id, ["cancel_bookings"], ctx)).rejects.toThrow(ForbiddenError);
    });

    it("permission changes apply on the next request and are audited", async () => {
      const s = await newSupervisor(["confirm_bookings"]);
      expect((await setSupervisorPermissions(admin, s.id, ["cancel_bookings", "cancel_bookings"], ctx)).ok).toBe(true);
      expect((await s.session()).permissions).toEqual(["cancel_bookings"]);

      const [log] = await db.select().from(auditLogs).where(eq(auditLogs.action, "supervisor.permissions_changed"));
      expect(log.meta).toMatchObject({ added: ["cancel_bookings"], removed: ["confirm_bookings"] });
    });

    it("freezing ends open sessions and blocks login", async () => {
      const s = await newSupervisor([], "frozen1");
      await setSupervisorActive(admin, s.id, false, ctx);
      expect(await getSessionUser(s.token)).toBeNull();
      expect(await authenticate("frozen1", "password123", ctx)).toMatchObject({ ok: false, reason: "frozen" });
      await setSupervisorActive(admin, s.id, true, ctx);
      expect((await authenticate("frozen1", "password123", ctx)).ok).toBe(true);
    });

    it("soft delete frees the username and drops trip assignments", async () => {
      const trip = await openTrip();
      const s = await newSupervisor([], "gone");
      await assignSupervisor(admin, trip.id, s.id, ctx);
      expect((await deleteSupervisor(admin, s.id, ctx)).ok).toBe(true);
      expect(await getSessionUser(s.token)).toBeNull();
      expect(await db.select().from(activitySupervisors)).toHaveLength(0);
      expect(await listSupervisors()).toHaveLength(0);
      expect((await newSupervisor([], "gone")).id).toBeGreaterThan(s.id);
    });

    it("password reset signs the supervisor out", async () => {
      const s = await newSupervisor([], "resetme");
      expect((await resetSupervisorPassword(admin, s.id, "short", ctx)).ok).toBe(false);
      expect((await resetSupervisorPassword(admin, s.id, "newpassword1", ctx)).ok).toBe(true);
      expect(await getSessionUser(s.token)).toBeNull();
      expect((await authenticate("resetme", "newpassword1", ctx)).ok).toBe(true);
    });

    it("cannot touch admins through the supervisor routes", async () => {
      const other = await createUser("admin");
      expect(await setSupervisorActive(admin, other.id, false, ctx)).toEqual({ ok: false, error: "الحساب مش موجود" });
    });
  });

  describe("trip visibility", () => {
    it("shows only assigned trips by default", async () => {
      const a = await openTrip({ title: "رحلة أ" });
      await openTrip({ title: "رحلة ب" });
      const s = await newSupervisor();
      const me = await s.session();

      expect(await canViewTrip(me, a.id)).toBe(false);
      expect(await listTrips("upcoming", await visibleTripsCondition(me))).toHaveLength(0);

      await assignSupervisor(admin, a.id, s.id, ctx);
      expect(await canViewTrip(me, a.id)).toBe(true);
      expect((await listTrips("upcoming", await visibleTripsCondition(me))).map((t) => t.title)).toEqual(["رحلة أ"]);
      expect(await assignSupervisor(admin, a.id, s.id, ctx)).toEqual({ ok: false, error: "المشرف ده مضاف على الرحلة بالفعل" });

      await unassignSupervisor(admin, a.id, s.id, ctx);
      expect(await canViewTrip(me, a.id)).toBe(false);
    });

    it("shows every trip when the setting allows it", async () => {
      await openTrip();
      const superAdmin = await createUser("super_admin");
      await updateSettings(superAdmin, { supervisor_trip_visibility: "all" }, ctx);
      const me = await (await newSupervisor()).session();
      expect(await listTrips("upcoming", await visibleTripsCondition(me))).toHaveLength(1);
    });

    it("refuses frozen or non-supervisor accounts as trip supervisors", async () => {
      const trip = await openTrip();
      const s = await newSupervisor();
      await setSupervisorActive(admin, s.id, false, ctx);
      expect((await assignSupervisor(admin, trip.id, s.id, ctx)).ok).toBe(false);
      expect((await assignSupervisor(admin, trip.id, admin.id, ctx)).ok).toBe(false);
    });
  });

  describe("bus scope", () => {
    async function busTrip() {
      const trip = await openTrip({ busesEnabled: true, supervisorScope: "bus" });
      await createBus(admin, trip.id, { name: "أتوبيس 1", capacity: 2 }, ctx);
      await createBus(admin, trip.id, { name: "أتوبيس 2", capacity: 2 }, ctx);
      const [bus1, bus2] = await listBuses(trip.id);
      return { trip, bus1, bus2 };
    }

    async function confirmedOn(tripId: number, n: number, busId: number) {
      const r = await addManualBooking(admin, tripId, studentInput(n, facultyId), ctx);
      if (!r.ok) throw new Error(r.error);
      await assignBus(admin, r.bookingId, busId, ctx);
      return r.bookingId;
    }

    it("limits the list to the supervisor's bus, plus requests when they may handle them", async () => {
      const { trip, bus1, bus2 } = await busTrip();
      await confirmedOn(trip.id, 1, bus1.id);
      await confirmedOn(trip.id, 2, bus2.id);
      await book(trip.publicToken, 3);

      const plain = await newSupervisor();
      const handler = await newSupervisor(["confirm_bookings"]);
      for (const s of [plain, handler]) {
        await assignSupervisor(admin, trip.id, s.id, ctx);
        await setSupervisorBus(admin, trip.id, s.id, bus1.id, ctx);
      }

      const names = async (me: SessionUser) => {
        const { rows } = await listBookings(trip.id, { scope: await bookingScope(me, trip) });
        return rows.map((r) => r.student.phone).sort();
      };
      expect(await names(await plain.session())).toEqual([studentInput(1, facultyId).phone]);
      expect(await names(await handler.session())).toEqual([studentInput(1, facultyId).phone, studentInput(3, facultyId).phone].sort());
      expect(await names(admin)).toHaveLength(3);
    });

    it("sees the whole trip when the trip's scope is 'all'", async () => {
      const trip = await openTrip({ busesEnabled: true, supervisorScope: "all" });
      await addManualBooking(admin, trip.id, studentInput(1, facultyId), ctx);
      const s = await newSupervisor();
      await assignSupervisor(admin, trip.id, s.id, ctx);
      expect(await bookingScope(await s.session(), trip)).toEqual({ kind: "all" });
    });

    it("cannot act on bookings outside the scope", async () => {
      const { trip, bus1, bus2 } = await busTrip();
      const other = await confirmedOn(trip.id, 1, bus2.id);
      const s = await newSupervisor(["cancel_bookings", "confirm_bookings"]);
      await assignSupervisor(admin, trip.id, s.id, ctx);
      await setSupervisorBus(admin, trip.id, s.id, bus1.id, ctx);
      expect(await cancelBooking(await s.session(), other, ctx)).toEqual({ ok: false, error: "الحجز مش موجود" });

      const mine = await confirmedOn(trip.id, 2, bus1.id);
      expect((await cancelBooking(await s.session(), mine, ctx)).ok).toBe(true);
    });

    it("cannot act on trips they don't see", async () => {
      const trip = await openTrip();
      await book(trip.publicToken, 1);
      const { rows } = await listBookings(trip.id);
      const s = await newSupervisor(["confirm_bookings", "add_students"]);
      expect(await confirmBooking(await s.session(), rows[0].booking.id, ctx)).toEqual({ ok: false, error: "الحجز مش موجود" });
      expect(await addManualBooking(await s.session(), trip.id, studentInput(2, facultyId), ctx)).toEqual({
        ok: false,
        error: "الرحلة مش موجودة",
      });

      await assignSupervisor(admin, trip.id, s.id, ctx);
      expect((await confirmBooking(await s.session(), rows[0].booking.id, ctx)).ok).toBe(true);
    });

    it("manual add by a bus-scoped supervisor lands on their bus", async () => {
      const { trip, bus1 } = await busTrip();
      const s = await newSupervisor(["add_students"]);
      await assignSupervisor(admin, trip.id, s.id, ctx);
      const me = await s.session();
      expect(await addManualBooking(me, trip.id, studentInput(1, facultyId), ctx)).toEqual({
        ok: false,
        error: "انت مش متسكّن على أتوبيس في الرحلة دي، كلّم الأدمن",
      });

      await setSupervisorBus(admin, trip.id, s.id, bus1.id, ctx);
      expect((await addManualBooking(me, trip.id, studentInput(1, facultyId), ctx)).ok).toBe(true);
      expect((await addManualBooking(me, trip.id, studentInput(2, facultyId), ctx)).ok).toBe(true);
      expect(await addManualBooking(me, trip.id, studentInput(3, facultyId), ctx)).toEqual({ ok: false, error: "أتوبيس 1 مليان" });

      const { rows } = await listBookings(trip.id, { scope: await bookingScope(me, trip) });
      expect(rows.every((r) => r.booking.busId === bus1.id)).toBe(true);
    });

    it("supervisor bus must belong to the trip", async () => {
      const { trip, bus1 } = await busTrip();
      const other = await openTrip({ busesEnabled: true });
      await createBus(admin, other.id, { name: "غريب", capacity: 5 }, ctx);
      const [foreign] = await listBuses(other.id);
      const s = await newSupervisor();
      await assignSupervisor(admin, trip.id, s.id, ctx);

      expect(await setSupervisorBus(admin, trip.id, s.id, foreign.id, ctx)).toEqual({ ok: false, error: "الأتوبيس مش موجود" });
      expect((await setSupervisorBus(admin, trip.id, s.id, bus1.id, ctx)).ok).toBe(true);
      expect((await listTripSupervisors(trip.id))[0].busName).toBe("أتوبيس 1");
    });
  });

  it("masked viewers can't search by national ID", async () => {
    const trip = await openTrip();
    await book(trip.publicToken, 1);
    const nid = studentInput(1, facultyId).nationalId as string;
    expect((await listBookings(trip.id, { q: nid })).rows).toHaveLength(1);
    expect((await listBookings(trip.id, { q: nid, searchNationalId: false })).rows).toHaveLength(0);
    expect((await listBookings(trip.id, { q: studentInput(1, facultyId).phone as string, searchNationalId: false })).rows).toHaveLength(1);
  });
});

describe("supervisor payments", () => {
  it("supervisors can't record payment through manual add", async () => {
    await resetDb();
    const admin = await createUser("admin");
    const facultyId = (await createFaculty()).id;
    const r = await createTrip(admin, tripInput({ feeEnabled: true, feeAmount: "300", paymentRequired: false }), ctx);
    const req = await createTrip(admin, tripInput({ feeEnabled: true, feeAmount: "300", paymentRequired: true }), ctx);
    if (!r.ok || !req.ok) throw new Error("trip");
    const c = await createSupervisor(admin, { name: "مشرف", username: "payer", password: "password123", permissions: ["add_students"] }, ctx);
    await assignSupervisor(admin, r.id, c.id!, ctx);
    await assignSupervisor(admin, req.id, c.id!, ctx);
    const { token } = await createSession(c.id!, ctx);
    const me = (await getSessionUser(token))!;

    expect((await addManualBooking(me, r.id, { ...studentInput(1, facultyId), paid: true }, ctx)).ok).toBe(true);
    const { rows } = await listBookings(r.id);
    expect(rows[0].booking.paidAt).toBeNull();
    expect(await addManualBooking(me, req.id, { ...studentInput(2, facultyId), paid: true }, ctx)).toEqual({
      ok: false,
      error: "الرحلة دي التأكيد فيها بعد الدفع، والإضافة فيها من الأدمن بس",
    });
  });
});
