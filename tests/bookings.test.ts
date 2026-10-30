import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/db";
import { activities, auditLogs, bookings, students } from "@/db/schema";
import type { SessionUser } from "@/lib/auth/service";
import {
  addManualBooking,
  bookingStats,
  cancelBooking,
  confirmBooking,
  getPublicTrip,
  listBookings,
  promoteBooking,
  resolveSubmittedData,
  setBookingOpen,
  setPayment,
  submitPublicBooking,
} from "@/lib/bookings/service";
import { ForbiddenError } from "@/lib/errors";
import { updateSettings } from "@/lib/settings/service";
import { createTrip, deleteTrip, getTrip, updateTrip, type TripInput } from "@/lib/trips/service";
import { createFaculty, createUser, ctx, daysFromToday, resetDb, studentInput, tripInput } from "./helpers";

describe("bookings", () => {
  let admin: SessionUser;
  let facultyId: number;

  async function openTrip(overrides: Partial<TripInput> = {}) {
    const r = await createTrip(admin, tripInput(overrides), ctx);
    if (!r.ok) throw new Error("trip");
    await setBookingOpen(admin, r.id, true, ctx);
    return (await getTrip(r.id))!;
  }

  const book = (token: string, n: number, overrides = {}, ip = "10.0.0.1") =>
    submitPublicBooking(token, studentInput(n, facultyId, overrides), { ip, userAgent: "vitest" });

  async function bookingOf(activityId: number, n: number) {
    const { rows } = await listBookings(activityId, { q: studentInput(n, facultyId).nationalId as string });
    return rows[0].booking;
  }

  beforeEach(async () => {
    await resetDb();
    admin = await createUser("admin");
    facultyId = (await createFaculty()).id;
  });

  describe("public form", () => {
    it("accepts a valid booking as pending and links returning students", async () => {
      const trip = await openTrip();
      expect(await book(trip.publicToken, 1)).toEqual({ ok: true, status: "pending", position: null });

      const other = await openTrip({ date: daysFromToday(20) });
      expect((await book(other.publicToken, 1)).ok).toBe(true);
      expect(await db.select().from(students)).toHaveLength(1);

      const [log] = await db.select().from(auditLogs).where(eq(auditLogs.action, "booking.submitted"));
      expect(log.actorType).toBe("anonymous");
    });

    it("validates name, phone, national ID, faculty and year, accepting Arabic digits", async () => {
      const trip = await openTrip();
      const bad = await book(trip.publicToken, 1, { name: "محمد أحمد", phone: "0201234567", nationalId: "30402301612341", year: 6 });
      expect(bad.ok).toBe(false);
      if (!bad.ok) expect(Object.keys(bad.errors ?? {}).sort()).toEqual(["name", "nationalId", "phone", "year"]);

      expect((await book(trip.publicToken, 2, { facultyId: 999 })).ok).toBe(false);
      // Future birth date and unknown governorate code
      expect((await book(trip.publicToken, 3, { nationalId: "39901011612341" })).ok).toBe(false);
      expect((await book(trip.publicToken, 4, { nationalId: "30401019912341" })).ok).toBe(false);

      const arabic = await book(trip.publicToken, 5, { phone: "٠١٢٣٤٥٦٧٨٩٠", nationalId: "٣٠٤٠١٠١١٦٠٠٠٥١", name: "  سارة   محمود  علي  حسن " });
      expect(arabic.ok).toBe(true);
      const [s] = await db.select().from(students);
      expect(s).toMatchObject({ phone: "01234567890", nationalId: "30401011600051", name: "سارة محمود علي حسن" });
    });

    it("refuses a duplicate booking in the same trip, whatever its status", async () => {
      const trip = await openTrip();
      await book(trip.publicToken, 1);
      expect(await book(trip.publicToken, 1)).toMatchObject({ ok: false, error: expect.stringContaining("في انتظار التأكيد") });

      await cancelBooking(admin, (await bookingOf(trip.id, 1)).id, ctx);
      expect(await book(trip.publicToken, 1)).toMatchObject({ ok: false, error: expect.stringContaining("اتلغى") });
    });

    it("refuses two trips on the same day and names the other trip", async () => {
      const date = daysFromToday(7);
      const first = await openTrip({ title: "رحلة الفيوم", date });
      const second = await openTrip({ title: "رحلة السخنة", date });
      await book(first.publicToken, 1);
      expect(await book(second.publicToken, 1)).toMatchObject({ ok: false, error: expect.stringContaining("«رحلة الفيوم»") });

      // A cancelled booking no longer blocks the day.
      await cancelBooking(admin, (await bookingOf(first.id, 1)).id, ctx);
      expect((await book(second.publicToken, 1)).ok).toBe(true);
    });

    it("is closed until opened, after the trip starts, and for unknown tokens", async () => {
      const r = await createTrip(admin, tripInput(), ctx);
      if (!r.ok) throw new Error();
      const trip = (await getTrip(r.id))!;
      expect((await getPublicTrip(trip.publicToken))?.availability).toBe("closed");
      expect(await book(trip.publicToken, 1)).toMatchObject({ ok: false, error: "الحجز في الرحلة دي مقفول" });

      await setBookingOpen(admin, trip.id, true, ctx);
      expect((await getPublicTrip(trip.publicToken))?.availability).toBe("open");

      await db.update(activities).set({ status: "ongoing" }).where(eq(activities.id, trip.id));
      expect((await getPublicTrip(trip.publicToken))?.availability).toBe("closed");
      expect(await getPublicTrip("nope-not-a-real-token")).toBeNull();
      expect((await book("nope-not-a-real-token", 2)).ok).toBe(false);
    });

    it("closes when full and reopens when a seat frees up", async () => {
      const trip = await openTrip({ capacity: 2, whenFull: "close" });
      await book(trip.publicToken, 1);
      await book(trip.publicToken, 2);
      expect((await getPublicTrip(trip.publicToken))?.availability).toBe("full");
      expect(await book(trip.publicToken, 3)).toMatchObject({ ok: false, error: "العدد اكتمل والحجز اتقفل" });

      await cancelBooking(admin, (await bookingOf(trip.id, 1)).id, ctx);
      expect((await book(trip.publicToken, 3)).ok).toBe(true);
    });

    it("rate limits by national ID failures and by IP", async () => {
      const trip = await openTrip();
      await book(trip.publicToken, 1);
      for (let i = 0; i < 5; i++) await book(trip.publicToken, 1);
      expect(await book(trip.publicToken, 1)).toMatchObject({ ok: false, locked: expect.any(Number) });

      for (let i = 0; i < 60; i++) await book(trip.publicToken, 100 + i, { name: "x" }, "10.9.9.9");
      const r = await book(trip.publicToken, 200, {}, "10.9.9.9");
      expect(r).toMatchObject({ ok: false, error: expect.stringContaining("نفس الشبكة") });
    });
  });

  describe("waitlist", () => {
    it("queues bookings when full and auto-promotes on cancellation", async () => {
      const trip = await openTrip({ capacity: 1, whenFull: "waitlist", waitlistPromotion: "auto" });
      await book(trip.publicToken, 1);
      expect(await book(trip.publicToken, 2)).toEqual({ ok: true, status: "waitlisted", position: 1 });
      expect(await book(trip.publicToken, 3)).toEqual({ ok: true, status: "waitlisted", position: 2 });

      const r = await cancelBooking(admin, (await bookingOf(trip.id, 1)).id, ctx);
      expect(r.ok && r.promotedId).toBe((await bookingOf(trip.id, 2)).id);
      expect((await bookingOf(trip.id, 2)).status).toBe("pending");
      expect((await bookingOf(trip.id, 3)).status).toBe("waitlisted");

      // Cancelling a waitlisted booking frees no seat.
      await cancelBooking(admin, (await bookingOf(trip.id, 3)).id, ctx);
      expect((await bookingStats(trip)).waitlisted).toBe(0);
    });

    it("waits for the admin when promotion is manual", async () => {
      const trip = await openTrip({ capacity: 1, whenFull: "waitlist", waitlistPromotion: "manual" });
      await book(trip.publicToken, 1);
      await book(trip.publicToken, 2);
      const waiting = await bookingOf(trip.id, 2);
      expect((await promoteBooking(admin, waiting.id, ctx)).ok).toBe(false);

      await cancelBooking(admin, (await bookingOf(trip.id, 1)).id, ctx);
      expect((await bookingOf(trip.id, 2)).status).toBe("waitlisted");
      expect((await promoteBooking(admin, waiting.id, ctx)).ok).toBe(true);
      expect((await bookingOf(trip.id, 2)).status).toBe("pending");
    });
  });

  describe("different data for an existing national ID", () => {
    async function rebookWithNewPhone(policy: "update" | "keep" | "flag") {
      const superAdmin = await createUser("super_admin");
      await updateSettings(superAdmin, { duplicate_national_id_policy: policy }, ctx);
      const a = await openTrip();
      const b = await openTrip({ date: daysFromToday(30) });
      await book(a.publicToken, 1);
      await book(b.publicToken, 1, { phone: "01198765432" });
      const [s] = await db.select().from(students);
      return { s, booking: await bookingOf(b.id, 1) };
    }

    it("updates the student when the policy is update", async () => {
      const { s, booking } = await rebookWithNewPhone("update");
      expect(s.phone).toBe("01198765432");
      expect(booking.submittedData).toBeNull();
    });

    it("keeps the stored data when the policy is keep", async () => {
      const { s, booking } = await rebookWithNewPhone("keep");
      expect(s.phone).toBe("01012340001");
      expect(booking.submittedData).toBeNull();
    });

    it("flags the booking and lets the admin choose when the policy is flag", async () => {
      const { s, booking } = await rebookWithNewPhone("flag");
      expect(s.phone).toBe("01012340001");
      expect(booking.submittedData).toMatchObject({ phone: "01198765432" });
      expect((await confirmBooking(admin, booking.id, ctx)).ok).toBe(false);

      expect((await resolveSubmittedData(admin, booking.id, "apply", ctx)).ok).toBe(true);
      const [after] = await db.select().from(students);
      expect(after.phone).toBe("01198765432");
      expect((await confirmBooking(admin, booking.id, ctx)).ok).toBe(true);
    });
  });

  describe("staff actions", () => {
    it("confirms and cancels with who and when", async () => {
      const trip = await openTrip();
      await book(trip.publicToken, 1);
      const b = await bookingOf(trip.id, 1);
      expect((await confirmBooking(admin, b.id, ctx)).ok).toBe(true);
      expect(await bookingOf(trip.id, 1)).toMatchObject({ status: "confirmed", handledBy: admin.id, handledAt: expect.any(Date) });
      expect((await confirmBooking(admin, b.id, ctx)).ok).toBe(false);

      expect((await cancelBooking(admin, b.id, ctx)).ok).toBe(true);
      expect((await bookingOf(trip.id, 1)).status).toBe("cancelled");
      const actions = (await db.select().from(auditLogs)).map((l) => l.action);
      expect(actions).toEqual(expect.arrayContaining(["booking.confirmed", "booking.cancelled"]));
    });

    it("adds students manually as confirmed, restoring a cancelled booking", async () => {
      const trip = await openTrip();
      const r = await addManualBooking(admin, trip.id, studentInput(1, facultyId), ctx);
      expect(r.ok).toBe(true);
      expect(await bookingOf(trip.id, 1)).toMatchObject({ status: "confirmed", source: "manual" });
      expect((await addManualBooking(admin, trip.id, studentInput(1, facultyId), ctx)).ok).toBe(false);

      await cancelBooking(admin, (await bookingOf(trip.id, 1)).id, ctx);
      expect((await addManualBooking(admin, trip.id, studentInput(1, facultyId, { year: 3 }), ctx)).ok).toBe(true);
      expect((await bookingOf(trip.id, 1)).status).toBe("confirmed");
      expect((await db.select().from(students))[0].year).toBe(3);
    });

    it("works on a closed form but not past capacity", async () => {
      const r = await createTrip(admin, tripInput({ capacity: 1 }), ctx);
      if (!r.ok) throw new Error();
      expect((await addManualBooking(admin, r.id, studentInput(1, facultyId), ctx)).ok).toBe(true);
      expect(await addManualBooking(admin, r.id, studentInput(2, facultyId), ctx)).toMatchObject({ ok: false, error: expect.stringContaining("مكتملة") });
    });

    it("lets admins override the same-day rule, audited", async () => {
      const date = daysFromToday(7);
      const a = await openTrip({ title: "رحلة الفيوم", date });
      const b = await openTrip({ date });
      await book(a.publicToken, 1);

      const blocked = await addManualBooking(admin, b.id, studentInput(1, facultyId), ctx);
      expect(blocked).toMatchObject({ ok: false, errors: { allowSameDay: expect.any(String) } });
      expect((await addManualBooking(admin, b.id, { ...studentInput(1, facultyId), allowSameDay: true }, ctx)).ok).toBe(true);

      const [log] = await db.select().from(auditLogs).where(eq(auditLogs.action, "booking.manual_added"));
      expect(log.meta).toMatchObject({ sameDayOverride: "رحلة الفيوم" });
    });

    it("guards trip capacity and deletion once seats are held", async () => {
      const trip = await openTrip({ capacity: 3 });
      await book(trip.publicToken, 1);
      await book(trip.publicToken, 2);
      expect((await updateTrip(admin, trip.id, tripInput({ capacity: 1 }), ctx)).ok).toBe(false);
      expect((await updateTrip(admin, trip.id, tripInput({ capacity: 2 }), ctx)).ok).toBe(true);
      expect((await deleteTrip(admin, trip.id, ctx)).ok).toBe(false);
    });

    it("supervisors without permissions cannot act on bookings", async () => {
      const trip = await openTrip();
      await book(trip.publicToken, 1);
      const sup = await createUser("supervisor");
      const b = await bookingOf(trip.id, 1);
      await expect(confirmBooking(sup, b.id, ctx)).rejects.toThrow(ForbiddenError);
      await expect(cancelBooking(sup, b.id, ctx)).rejects.toThrow(ForbiddenError);
      await expect(addManualBooking(sup, trip.id, studentInput(2, facultyId), ctx)).rejects.toThrow(ForbiddenError);
      await expect(setBookingOpen(sup, trip.id, false, ctx)).rejects.toThrow(ForbiddenError);
    });

    it("blocks changes once the trip is finished", async () => {
      const trip = await openTrip();
      await book(trip.publicToken, 1);
      await db.update(activities).set({ status: "finished" }).where(eq(activities.id, trip.id));
      expect((await confirmBooking(admin, (await bookingOf(trip.id, 1)).id, ctx)).ok).toBe(false);
      expect((await addManualBooking(admin, trip.id, studentInput(2, facultyId), ctx)).ok).toBe(false);
      expect((await setBookingOpen(admin, trip.id, true, ctx)).ok).toBe(false);
    });
  });

  describe("payments", () => {
    it("records payments and sums the collected amount", async () => {
      const trip = await openTrip({ feeEnabled: true, feeAmount: "250" });
      await book(trip.publicToken, 1);
      await book(trip.publicToken, 2);
      const b = await bookingOf(trip.id, 1);
      expect((await setPayment(admin, b.id, true, ctx)).ok).toBe(true);
      expect(await bookingOf(trip.id, 1)).toMatchObject({ paidAmount: "250.00", paymentRecordedBy: admin.id });

      const stats = await bookingStats(trip);
      expect(stats).toMatchObject({ paid: 1, collected: 250, pending: 2, remaining: 48 });
      expect((await listBookings(trip.id, { paid: "unpaid" })).rows).toHaveLength(1);
    });

    it("requires payment before confirming when the trip says so", async () => {
      const trip = await openTrip({ feeEnabled: true, feeAmount: "250", paymentRequired: true });
      await book(trip.publicToken, 1);
      const b = await bookingOf(trip.id, 1);
      expect((await confirmBooking(admin, b.id, ctx)).ok).toBe(false);
      await setPayment(admin, b.id, true, ctx);
      expect((await confirmBooking(admin, b.id, ctx)).ok).toBe(true);
      expect((await setPayment(admin, b.id, false, ctx)).ok).toBe(false);

      expect((await addManualBooking(admin, trip.id, studentInput(2, facultyId), ctx)).ok).toBe(false);
      expect((await addManualBooking(admin, trip.id, { ...studentInput(2, facultyId), paid: true }, ctx)).ok).toBe(true);
    });

    it("refuses payments on trips without a fee", async () => {
      const trip = await openTrip();
      await book(trip.publicToken, 1);
      expect((await setPayment(admin, (await bookingOf(trip.id, 1)).id, true, ctx)).ok).toBe(false);
    });
  });

  it("searches by name, phone and national ID", async () => {
    const trip = await openTrip();
    await book(trip.publicToken, 1, { name: "يوسف خالد محمود سيد" });
    await book(trip.publicToken, 2);
    expect((await listBookings(trip.id, { q: "يوسف محمود" })).rows).toHaveLength(1);
    expect((await listBookings(trip.id, { q: "01012340002" })).rows).toHaveLength(1);
    expect((await listBookings(trip.id, { q: "٠٠٠٢" })).rows).toHaveLength(1);
    expect((await listBookings(trip.id, { status: "pending" })).rows).toHaveLength(2);
    expect((await listBookings(trip.id, { status: "confirmed" })).rows).toHaveLength(0);
    expect(await db.select().from(bookings)).toHaveLength(2);
  });
});
