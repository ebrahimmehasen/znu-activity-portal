import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/db";
import { attendances, auditLogs, bookings, checkpoints, type SupervisorPermission } from "@/db/schema";
import {
  addCheckpoint,
  checkpointRoster,
  confirmRecords,
  endTrip,
  finalAbsentees,
  listCheckpoints,
  listSupervisorAttendance,
  lockRoster,
  markAbsent,
  markRemainingAbsent,
  rejectedRecords,
  reopenTrip,
  restoreAbsent,
  scanPack,
  setCheckpointOpen,
  startTrip,
  syncAttendance,
  tallies,
  voidRecord,
  type SyncRecord,
} from "@/lib/attendance/service";
import { createSession, getSessionUser, type SessionUser } from "@/lib/auth/service";
import { addManualBooking, cancelBooking, setBookingOpen } from "@/lib/bookings/service";
import { assignBus, createBus, listBuses } from "@/lib/buses/service";
import { ForbiddenError } from "@/lib/errors";
import { ensureBookingSecret, ensureUserSecret } from "@/lib/qr/secrets";
import { counterAt, totp } from "@/lib/qr/totp";
import { updateSettings } from "@/lib/settings/service";
import { offlineQrData } from "@/lib/students/auth";
import { assignSupervisor, setSupervisorBus } from "@/lib/supervisors/assignments";
import { createSupervisor } from "@/lib/supervisors/service";
import { createTrip, getTrip, type TripInput } from "@/lib/trips/service";
import { createFaculty, createUser, ctx, daysFromToday, resetDb, studentInput, tripInput } from "./helpers";

describe("trip run and attendance", () => {
  let admin: SessionUser;
  let facultyId: number;

  async function newTrip(overrides: Partial<TripInput> = {}) {
    // No departure time: the first gathering counts from the start, so scans are on time.
    const r = await createTrip(admin, tripInput({ date: daysFromToday(0), startTime: "", ...overrides }), ctx);
    if (!r.ok) throw new Error("trip");
    return r.id;
  }

  async function book(tripId: number, n: number) {
    const r = await addManualBooking(admin, tripId, studentInput(n, facultyId), ctx);
    if (!r.ok) throw new Error(JSON.stringify(r));
    return r.bookingId;
  }

  async function started(students = 3) {
    const id = await newTrip();
    const ids = [];
    for (let n = 1; n <= students; n++) ids.push(await book(id, n));
    expect(await startTrip(admin, id, ctx)).toEqual({ ok: true });
    const [cp] = await listCheckpoints(id);
    return { id, bookingIds: ids, cp };
  }

  async function newSupervisor(permissions: SupervisorPermission[], tripId?: number) {
    const r = await createSupervisor(admin, { name: "مشرف", username: `s${Math.random().toString(36).slice(2, 8)}`, password: "password123", permissions }, ctx);
    if (!r.ok) throw new Error("sup");
    if (tripId) await assignSupervisor(admin, tripId, r.id!, ctx);
    const { token } = await createSession(r.id!, ctx);
    return (await getSessionUser(token))!;
  }

  const codeFor = async (bookingId: number, at = Date.now()) => totp((await ensureBookingSecret(bookingId, null))!, counterAt(at));

  const scan = async (bookingId: number, checkpointId: number, over: Partial<SyncRecord> = {}): Promise<SyncRecord> =>
    ({
      kind: "student",
      clientUuid: crypto.randomUUID(),
      checkpointId,
      bookingId,
      method: "qr",
      code: await codeFor(bookingId, over.recordedAt),
      recordedAt: Date.now(),
      ...over,
    }) as SyncRecord;

  async function sync(actor: SessionUser, tripId: number, records: unknown[]) {
    const r = await syncAttendance(actor, tripId, records);
    if (!r.ok) throw new Error(r.error);
    return r.outcomes;
  }

  beforeEach(async () => {
    await resetDb();
    admin = await createUser("admin");
    facultyId = (await createFaculty()).id;
  });

  describe("start and end", () => {
    it("starts on the trip day only, closes booking and opens the first gathering", async () => {
      const later = await newTrip({ date: daysFromToday(3) });
      expect(await startTrip(admin, later, ctx)).toEqual({ ok: false, error: "يمكن بدء الرحلة في يومها فقط" });

      const id = await newTrip();
      await setBookingOpen(admin, id, true, ctx);
      expect(await startTrip(admin, id, ctx)).toEqual({ ok: true });
      const trip = (await getTrip(id))!;
      expect(trip.status).toBe("ongoing");
      expect(trip.bookingOpen).toBe(false);
      const cps = await listCheckpoints(id);
      expect(cps).toHaveLength(1);
      expect(cps[0]).toMatchObject({ name: "التجمع الأول", sortOrder: 1 });
      expect(cps[0].openedAt).not.toBeNull();
      expect((await startTrip(admin, id, ctx)).ok).toBe(false);
    });

    it("ends only an ongoing trip, closing open gatherings; reopening needs explicit confirmation", async () => {
      const id = await newTrip();
      expect(await endTrip(admin, id, ctx)).toEqual({ ok: false, error: "يمكن إنهاء الرحلات الجارية فقط" });
      await startTrip(admin, id, ctx);
      expect(await endTrip(admin, id, ctx)).toEqual({ ok: true });
      expect((await getTrip(id))!.status).toBe("finished");
      expect((await listCheckpoints(id))[0].closedAt).not.toBeNull();

      expect((await reopenTrip(admin, id, false, ctx)).ok).toBe(false);
      expect(await reopenTrip(admin, id, true, ctx)).toEqual({ ok: true });
      expect((await getTrip(id))!.status).toBe("ongoing");
      const logged = await db.select().from(auditLogs).where(eq(auditLogs.action, "activity.reopened"));
      expect(logged).toHaveLength(1);
    });

    it("keeps start/end for admins", async () => {
      const id = await newTrip();
      const sup = await newSupervisor(["take_attendance", "manage_gatherings"], id);
      await expect(startTrip(sup, id, ctx)).rejects.toThrow(ForbiddenError);
    });
  });

  describe("scanning", () => {
    it("records a valid QR as present, and the same student again as a duplicate", async () => {
      const { id, bookingIds, cp } = await started();
      const rec = await scan(bookingIds[0], cp.id);
      const [first] = await sync(admin, id, [rec]);
      expect(first).toMatchObject({ result: "recorded", status: "present", name: "محمد أحمد علي حسن" });

      // The same upload again (e.g. after a timeout) answers the same and stores nothing new.
      expect((await sync(admin, id, [rec]))[0].result).toBe("recorded");
      const second = await sync(admin, id, [await scan(bookingIds[0], cp.id)]);
      expect(second[0].result).toBe("duplicate");
      expect(await db.select().from(attendances)).toHaveLength(1);
    });

    it("rejects an expired or forged code and keeps it visible", async () => {
      const { id, bookingIds, cp } = await started();
      const old = Date.now() - 5 * 60_000;
      const stale = await scan(bookingIds[0], cp.id, { code: await codeFor(bookingIds[0], old) });
      const forged = await scan(bookingIds[1], cp.id, { code: "00000000" });
      const out = await sync(admin, id, [stale, forged]);
      expect(out.map((o) => o.result)).toEqual(["invalid", "invalid"]);
      const rejected = await rejectedRecords(cp, { kind: "all" });
      expect(rejected).toHaveLength(2);
      // A rejection doesn't block a later good scan.
      expect((await sync(admin, id, [await scan(bookingIds[0], cp.id)]))[0].result).toBe("recorded");
    });

    it("checks the code at the device scan time (offline sync)", async () => {
      const { id, bookingIds, cp } = await started();
      // Opened a while ago, scanned offline 3 minutes ago, synced now.
      await db.update(checkpoints).set({ openedAt: new Date(Date.now() - 10 * 60_000) }).where(eq(checkpoints.id, cp.id));
      const at = Date.now() - 3 * 60_000;
      const out = await sync(admin, id, [await scan(bookingIds[0], cp.id, { recordedAt: at })]);
      expect(out[0].result).toBe("recorded");
      const [row] = await db.select().from(attendances);
      expect(row.recordedAt.getTime()).toBe(at);
      expect(row.verified).toBe(true);
    });

    it("refuses a cancelled booking's code as revoked, and outsiders", async () => {
      const { id, bookingIds, cp } = await started();
      const rec = await scan(bookingIds[0], cp.id);
      await cancelBooking(admin, bookingIds[0], ctx);
      expect((await sync(admin, id, [rec]))[0].result).toBe("revoked");

      const other = await newTrip({ date: daysFromToday(5) });
      const outsider = await book(other, 9);
      expect((await sync(admin, id, [await scan(outsider, cp.id)]))[0].result).toBe("not_in_trip");
    });

    it("refuses scans outside the gathering's open window or from the future", async () => {
      const { id, bookingIds, cp } = await started();
      const before = await scan(bookingIds[0], cp.id, { recordedAt: Date.now() - 30 * 60_000 });
      const future = await scan(bookingIds[1], cp.id, { recordedAt: Date.now() + 10 * 60_000 });
      const out = await sync(admin, id, [before, future]);
      expect(out.map((o) => o.result)).toEqual(["closed", "error"]);
    });

    it("keeps the earliest scan when two devices record the same student", async () => {
      const { id, bookingIds, cp } = await started();
      await db.update(checkpoints).set({ openedAt: new Date(Date.now() - 10 * 60_000) }).where(eq(checkpoints.id, cp.id));
      await sync(admin, id, [await scan(bookingIds[0], cp.id)]);
      const earlier = Date.now() - 60_000;
      expect((await sync(admin, id, [await scan(bookingIds[0], cp.id, { recordedAt: earlier })]))[0].result).toBe("duplicate");
      const [row] = await db.select().from(attendances);
      expect(row.recordedAt.getTime()).toBe(earlier);
    });

    it("answers each record on its own in a batch", async () => {
      const { id, bookingIds, cp } = await started();
      const out = await sync(admin, id, [{ kind: "student", clientUuid: "nope" }, await scan(bookingIds[0], cp.id)]);
      expect(out.map((o) => o.result)).toEqual(["error", "recorded"]);
    });
  });

  describe("supervisors' records", () => {
    it("wait for the admin by default; direct confirmation skips the wait", async () => {
      const { id, bookingIds, cp } = await started();
      const sup = await newSupervisor(["take_attendance"], id);
      const direct = await newSupervisor(["take_attendance", "direct_attendance"], id);

      expect((await sync(sup, id, [await scan(bookingIds[0], cp.id)]))[0]).toMatchObject({ result: "pending" });
      expect((await sync(direct, id, [await scan(bookingIds[1], cp.id)]))[0]).toMatchObject({ result: "recorded" });

      const t = tallies(await checkpointRoster((await getTrip(id))!, cp, { kind: "all" }));
      expect(t).toMatchObject({ pending: 1, present: 1, unrecorded: 1 });

      expect(await confirmRecords(admin, cp.id, null, ctx)).toEqual({ ok: true, count: 1 });
      expect(tallies(await checkpointRoster((await getTrip(id))!, cp, { kind: "all" })).present).toBe(2);
    });

    it("need the attendance permission and the trip", async () => {
      const { id, bookingIds, cp } = await started();
      const noPerm = await newSupervisor(["manage_gatherings"], id);
      await expect(syncAttendance(noPerm, id, [await scan(bookingIds[0], cp.id)])).rejects.toThrow(ForbiddenError);
      const elsewhere = await newSupervisor(["take_attendance"]);
      expect(await syncAttendance(elsewhere, id, [])).toEqual({ ok: false, error: "الرحلة غير موجودة" });
    });

    it("stay within their bus", async () => {
      const id = await newTrip({ busesEnabled: true, supervisorScope: "bus" });
      await createBus(admin, id, { name: "أتوبيس 1", capacity: 20 }, ctx);
      await createBus(admin, id, { name: "أتوبيس 2", capacity: 20 }, ctx);
      const [bus1, bus2] = await listBuses(id);
      const mine = await book(id, 1);
      const theirs = await book(id, 2);
      await assignBus(admin, mine, bus1.id, ctx);
      await assignBus(admin, theirs, bus2.id, ctx);
      const sup = await newSupervisor(["take_attendance", "direct_attendance"], id);
      await setSupervisorBus(admin, id, sup.id, bus1.id, ctx);
      await startTrip(admin, id, ctx);
      const [cp] = await listCheckpoints(id);

      const out = await sync(sup, id, [await scan(mine, cp.id), await scan(theirs, cp.id)]);
      expect(out.map((o) => o.result)).toEqual(["recorded", "forbidden"]);
      const pack = await scanPack(sup, (await getTrip(id))!);
      expect(pack.students.map((s) => s.bookingId)).toEqual([mine]);
      expect(JSON.stringify(pack)).not.toMatch(/national|secret/i);
    });
  });

  describe("first gathering and the roster", () => {
    it("locks the count only when everyone is decided and confirmed", async () => {
      const { id, bookingIds, cp } = await started(3);
      await sync(admin, id, [await scan(bookingIds[0], cp.id)]);
      expect((await lockRoster(admin, id, ctx)).ok).toBe(false);

      const sup = await newSupervisor(["take_attendance"], id);
      await sync(sup, id, [await scan(bookingIds[1], cp.id)]);
      expect(await markRemainingAbsent(admin, cp.id, ctx)).toEqual({ ok: true, count: 1 });
      expect(await lockRoster(admin, id, ctx)).toEqual({ ok: false, error: "يوجد 1 تسجيل بانتظار التأكيد" });

      await confirmRecords(admin, cp.id, null, ctx);
      expect(await lockRoster(admin, id, ctx)).toEqual({ ok: true, present: 2, absent: 1 });
      expect((await listCheckpoints(id))[0].closedAt).not.toBeNull();
      // The first gathering takes no more scans.
      expect((await sync(admin, id, [await scan(bookingIds[2], cp.id)]))[0].result).toBe("closed");
    });

    it("drops final absentees from later gatherings and their QR", async () => {
      const { id, bookingIds, cp } = await started(2);
      await sync(admin, id, [await scan(bookingIds[0], cp.id)]);
      expect(await markAbsent(admin, cp.id, bookingIds[1], ctx)).toEqual({ ok: true });
      await lockRoster(admin, id, ctx);

      expect((await finalAbsentees(id, { kind: "all" })).map((r) => r.bookingId)).toEqual([bookingIds[1]]);

      const added = await addCheckpoint(admin, id, { name: "الغدا", time: "13:00" }, ctx);
      if (!added.ok) throw new Error("cp");
      await setCheckpointOpen(admin, added.id, true, ctx);
      const cp2 = (await listCheckpoints(id))[1];
      const roster = await checkpointRoster((await getTrip(id))!, cp2, { kind: "all" });
      expect(roster.map((r) => r.bookingId)).toEqual([bookingIds[0]]);
      expect((await sync(admin, id, [await scan(bookingIds[1], cp2.id)]))[0].result).toBe("not_in_trip");
    });

    it("lets a scan replace an absent mark before the count is confirmed", async () => {
      const { id, bookingIds, cp } = await started(1);
      await markAbsent(admin, cp.id, bookingIds[0], ctx);
      expect((await sync(admin, id, [await scan(bookingIds[0], cp.id)]))[0].result).toBe("recorded");
      expect(tallies(await checkpointRoster((await getTrip(id))!, cp, { kind: "all" }))).toMatchObject({ present: 1, absent: 0 });
    });

    it("restores a final absentee when the setting allows it", async () => {
      const { id, bookingIds, cp } = await started(1);
      await markAbsent(admin, cp.id, bookingIds[0], ctx);
      await lockRoster(admin, id, ctx);

      const superAdmin = await createUser("super_admin");
      await updateSettings(superAdmin, { restore_absent_student: "denied" }, ctx);
      expect((await restoreAbsent(admin, bookingIds[0], ctx)).ok).toBe(false);
      await updateSettings(superAdmin, { restore_absent_student: "allowed" }, ctx);
      expect(await restoreAbsent(admin, bookingIds[0], ctx)).toEqual({ ok: true });
      expect(await finalAbsentees(id, { kind: "all" })).toEqual([]);
    });
  });

  describe("later gatherings", () => {
    async function locked() {
      const s = await started(2);
      for (const b of s.bookingIds) await sync(admin, s.id, [await scan(b, s.cp.id)]);
      await lockRoster(admin, s.id, ctx);
      return s;
    }

    it("need the confirmed count, the permission, and one open at a time", async () => {
      const { id, cp } = await started(1);
      expect(await addCheckpoint(admin, id, { name: "الغدا", time: "13:00" }, ctx)).toEqual({ ok: false, error: "أكِّد عدد الرحلة في التجمع الأول أولًا" });
      await sync(admin, id, [await scan((await checkpointRoster((await getTrip(id))!, cp, { kind: "all" }))[0].bookingId, cp.id)]);
      await lockRoster(admin, id, ctx);

      const gatherer = await newSupervisor(["manage_gatherings"], id);
      const a = await addCheckpoint(gatherer, id, { name: "الغدا", time: "13:00" }, ctx);
      const b = await addCheckpoint(gatherer, id, { name: "الرجوع", time: "18:00" }, ctx);
      if (!a.ok || !b.ok) throw new Error("cp");
      expect(await setCheckpointOpen(gatherer, a.id, true, ctx)).toEqual({ ok: true });
      expect(await setCheckpointOpen(gatherer, b.id, true, ctx)).toEqual({ ok: false, error: "أغلق «الغدا» أولًا" });
      expect(await setCheckpointOpen(gatherer, cp.id, true, ctx)).toEqual({ ok: false, error: "يُغلق التجمع الأول عند تأكيد عدد الرحلة" });

      const outsider = await newSupervisor(["manage_gatherings"]);
      expect(await setCheckpointOpen(outsider, a.id, false, ctx)).toEqual({ ok: false, error: "التجمع غير موجود" });
      const plain = await newSupervisor(["take_attendance"], id);
      await expect(addCheckpoint(plain, id, { name: "x", time: "10:00" }, ctx)).rejects.toThrow(ForbiddenError);
    });

    it("marks late after the grace period, using the scan time", async () => {
      const { id, bookingIds } = await locked();
      const added = await addCheckpoint(admin, id, { name: "الغدا", time: "13:00" }, ctx);
      if (!added.ok) throw new Error("cp");
      await setCheckpointOpen(admin, added.id, true, ctx);
      // Gathering due 30 minutes ago, opened 40 minutes ago, 10 minutes' grace.
      await db
        .update(checkpoints)
        .set({ scheduledAt: new Date(Date.now() - 30 * 60_000), openedAt: new Date(Date.now() - 40 * 60_000) })
        .where(eq(checkpoints.id, added.id));
      const onTime = Date.now() - 25 * 60_000;
      const out = await sync(admin, id, [await scan(bookingIds[0], added.id, { recordedAt: onTime }), await scan(bookingIds[1], added.id)]);
      expect(out.map((o) => o.status)).toEqual(["present", "late"]);
    });

    it("accepts offline scans made before the gathering was closed", async () => {
      const { id, bookingIds } = await locked();
      const added = await addCheckpoint(admin, id, { name: "الغدا", time: "13:00" }, ctx);
      if (!added.ok) throw new Error("cp");
      await setCheckpointOpen(admin, added.id, true, ctx);
      const at = Date.now();
      await setCheckpointOpen(admin, added.id, false, ctx);
      expect((await sync(admin, id, [await scan(bookingIds[0], added.id, { recordedAt: at })]))[0].result).toBe("recorded");
    });
  });

  describe("admin corrections", () => {
    it("voids any record, confirmed or not, and logs it", async () => {
      const { id, bookingIds, cp } = await started(1);
      await sync(admin, id, [await scan(bookingIds[0], cp.id)]);
      const [rec] = await db.select().from(attendances);
      expect(await voidRecord(admin, rec.id, ctx)).toEqual({ ok: true });
      expect(tallies(await checkpointRoster((await getTrip(id))!, cp, { kind: "all" })).unrecorded).toBe(1);
      expect(await db.select().from(auditLogs).where(eq(auditLogs.action, "attendance.voided"))).toHaveLength(1);
      // The student can be scanned again.
      expect((await sync(admin, id, [await scan(bookingIds[0], cp.id)]))[0].result).toBe("recorded");

      const sup = await newSupervisor(["take_attendance", "direct_attendance"], id);
      const [again] = await db.select().from(attendances).where(eq(attendances.bookingId, bookingIds[0]));
      await expect(voidRecord(sup, again.id, ctx)).rejects.toThrow(ForbiddenError);
    });

    it("covers bookings added after the start; manual marks work like scans", async () => {
      const { id, cp } = await started(0);
      const late = await book(id, 5);
      const out = await sync(admin, id, [{ kind: "student", clientUuid: crypto.randomUUID(), checkpointId: cp.id, bookingId: late, method: "manual", recordedAt: Date.now() }]);
      expect(out[0]).toMatchObject({ result: "recorded" });
      expect((await db.select().from(attendances))[0].verified).toBe(false);
    });
  });

  describe("supervisors' attendance", () => {
    it("is taken by the admin from the supervisor's QR or by hand", async () => {
      const { id } = await started(0);
      const sup = await newSupervisor([], id);
      const other = await newSupervisor([]);
      const secret = (await ensureUserSecret(sup.id))!;
      const staff = async (userId: number, code?: string) => ({
        kind: "staff",
        clientUuid: crypto.randomUUID(),
        userId,
        method: code ? "qr" : "manual",
        code,
        recordedAt: Date.now(),
      });

      const out = await sync(admin, id, [
        await staff(sup.id, "00000000"),
        await staff(sup.id, await totp(secret, counterAt(Date.now()))),
        await staff(sup.id),
        await staff(other.id),
      ]);
      expect(out.map((o) => o.result)).toEqual(["invalid", "recorded", "duplicate", "not_in_trip"]);
      expect((await listSupervisorAttendance(id)).map((s) => Boolean(s.recordedAt))).toEqual([true]);

      const taker = await newSupervisor(["take_attendance"], id);
      expect((await sync(taker, id, [await staff(sup.id)]))[0].result).toBe("forbidden");
    });
  });

  it("hides the QR of a final absentee", async () => {
    const id = await newTrip();
    const r = await addManualBooking(admin, id, studentInput(1, facultyId), ctx);
    if (!r.ok) throw new Error("book");
    await startTrip(admin, id, ctx);
    const [cp] = await listCheckpoints(id);
    const [booking] = await db.select().from(bookings).where(eq(bookings.id, r.bookingId));
    expect(await offlineQrData(booking.studentId)).toHaveLength(1);
    await markAbsent(admin, cp.id, r.bookingId, ctx);
    expect(await offlineQrData(booking.studentId)).toEqual([]);
  });
});
