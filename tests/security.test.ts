import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/db";
import { attendances, bookings, type SupervisorPermission } from "@/db/schema";
import { deleteAnnouncement, sendAnnouncement } from "@/lib/announcements/service";
import {
  addCheckpoint,
  confirmRecords,
  listCheckpoints,
  lockRoster,
  setCheckpointOpen,
  startTrip,
  syncAttendance,
  voidRecord,
  type SyncRecord,
} from "@/lib/attendance/service";
import { authenticate, createSession, getSessionUser, type SessionUser } from "@/lib/auth/service";
import { createAdmin } from "@/lib/admins/service";
import { addManualBooking, cancelBooking, confirmBooking, setBookingOpen, submitPublicBooking } from "@/lib/bookings/service";
import { assignBus, createBus, listBuses } from "@/lib/buses/service";
import { ForbiddenError } from "@/lib/errors";
import { purgeTrip } from "@/lib/purge/service";
import { ensureBookingSecret } from "@/lib/qr/secrets";
import { counterAt, totp } from "@/lib/qr/totp";
import { tripReport } from "@/lib/reports/service";
import { updateSettings } from "@/lib/settings/service";
import { authenticateStudent, getStudentTrip, offlineQrData } from "@/lib/students/auth";
import { assignSupervisor, setSupervisorBus } from "@/lib/supervisors/assignments";
import { createSupervisor, setSupervisorActive } from "@/lib/supervisors/service";
import { createTrip, getTrip, type TripInput } from "@/lib/trips/service";
import { createFaculty, createUser, ctx, daysFromToday, nationalId, resetDb, studentInput, tripInput } from "./helpers";

/**
 * Internal penetration tests (phase 9): each case is an attack a signed-in supervisor,
 * a student or an anonymous visitor could try by editing requests. All must fail.
 */

let admin: SessionUser;
let facultyId: number;

async function newTrip(overrides: Partial<TripInput> = {}) {
  const r = await createTrip(admin, tripInput({ date: daysFromToday(0), startTime: "", ...overrides }), ctx);
  if (!r.ok) throw new Error("trip");
  return r.id;
}

async function book(tripId: number, n: number) {
  const r = await addManualBooking(admin, tripId, studentInput(n, facultyId), ctx);
  if (!r.ok) throw new Error(JSON.stringify(r));
  const [b] = await db.select().from(bookings).where(eq(bookings.id, r.bookingId));
  return b;
}

async function supervisor(permissions: SupervisorPermission[], tripId?: number, username = `s${Math.random().toString(36).slice(2, 8)}`) {
  const r = await createSupervisor(admin, { name: "مشرف", username, password: "password123", permissions }, ctx);
  if (!r.ok) throw new Error("sup");
  if (tripId) await assignSupervisor(admin, tripId, r.id!, ctx);
  const { token } = await createSession(r.id!, ctx);
  return { user: (await getSessionUser(token))!, token, id: r.id! };
}

const manual = (checkpointId: number, bookingId: number, recordedAt = Date.now()): SyncRecord => ({
  kind: "student",
  clientUuid: crypto.randomUUID(),
  checkpointId,
  bookingId,
  method: "manual",
  recordedAt,
});

async function outcome(actor: SessionUser, tripId: number, rec: unknown) {
  const r = await syncAttendance(actor, tripId, [rec]);
  if (!r.ok) throw new Error(r.error);
  return r.outcomes[0];
}

beforeEach(async () => {
  await resetDb();
  admin = await createUser("admin");
  facultyId = (await createFaculty()).id;
});

describe("attendance tampering", () => {
  it("a supervisor without direct confirmation can't rewrite a recorded student with an earlier time", async () => {
    const id = await newTrip();
    const b = await book(id, 1);
    await startTrip(admin, id, ctx);
    const [cp1] = await listCheckpoints(id);
    await syncAttendance(admin, id, [manual(cp1.id, b.id)]);
    await lockRoster(admin, id, ctx);
    // A gathering scheduled a minute ago, opened now: anyone recorded now is late? No grace → late.
    await addCheckpoint(admin, id, { name: "بعد الغدا", time: "00:00" }, ctx);
    const cp2 = (await listCheckpoints(id))[1];
    await setCheckpointOpen(admin, cp2.id, true, ctx);
    await syncAttendance(admin, id, [manual(cp2.id, b.id)]);
    const before = (await db.select().from(attendances).where(eq(attendances.checkpointId, cp2.id)))[0];

    const sup = await supervisor(["take_attendance"], id);
    const forged = manual(cp2.id, b.id, before.recordedAt.getTime() - 60_000);
    expect((await outcome(sup.user, id, forged)).result).toBe("duplicate");
    const after = (await db.select().from(attendances).where(eq(attendances.id, before.id)))[0];
    expect(after.recordedAt).toEqual(before.recordedAt);
    expect(after.status).toBe(before.status);
  });

  it("rejects records for another trip's students or gatherings, and from the future", async () => {
    const id = await newTrip();
    const other = await newTrip({ title: "تانية" });
    const mine = await book(id, 1);
    const theirs = await book(other, 2);
    await startTrip(admin, id, ctx);
    await startTrip(admin, other, ctx);
    const [cp] = await listCheckpoints(id);
    const [otherCp] = await listCheckpoints(other);

    expect((await outcome(admin, id, manual(cp.id, theirs.id))).result).toBe("not_in_trip");
    expect((await outcome(admin, id, manual(otherCp.id, mine.id))).result).toBe("closed");
    expect((await outcome(admin, id, manual(cp.id, mine.id, Date.now() + 60 * 60_000))).result).toBe("error");
  });

  it("refuses another student's QR code and a cancelled booking's code", async () => {
    const id = await newTrip();
    const a = await book(id, 1);
    const b = await book(id, 2);
    await startTrip(admin, id, ctx);
    const [cp] = await listCheckpoints(id);
    await ensureBookingSecret(b.id, null); // B has opened the portal, so B has a secret too
    const codeA = await totp((await ensureBookingSecret(a.id, null))!, counterAt(Date.now()));
    const asB = { ...manual(cp.id, b.id), method: "qr", code: codeA };
    expect((await outcome(admin, id, asB)).result).toBe("invalid");

    const codeB = await totp((await ensureBookingSecret(b.id, null))!, counterAt(Date.now()));
    await cancelBooking(admin, b.id, ctx);
    expect((await outcome(admin, id, { ...manual(cp.id, b.id), method: "qr", code: codeB })).result).toBe("revoked");
    expect((await offlineQrData(b.studentId)).map((x) => x.bookingId)).not.toContain(b.id);
  });

  it("keeps confirming, voiding and locking for admins", async () => {
    const id = await newTrip();
    const b = await book(id, 1);
    await startTrip(admin, id, ctx);
    const [cp] = await listCheckpoints(id);
    const sup = await supervisor(["take_attendance", "manage_gatherings"], id);
    await syncAttendance(sup.user, id, [manual(cp.id, b.id)]);
    const [rec] = await db.select().from(attendances);
    expect(rec.confirmedAt).toBeNull();
    await expect(confirmRecords(sup.user, cp.id, rec.id, ctx)).rejects.toThrow(ForbiddenError);
    await expect(voidRecord(sup.user, rec.id, ctx)).rejects.toThrow(ForbiddenError);
    await expect(lockRoster(sup.user, id, ctx)).rejects.toThrow(ForbiddenError);
  });
});

describe("crossing trips and buses", () => {
  it("a supervisor can't act on a trip they aren't assigned to", async () => {
    const id = await newTrip({ date: daysFromToday(5) });
    const other = await newTrip({ date: daysFromToday(6), title: "تانية" });
    await setBookingOpen(admin, other, true, ctx);
    const target = await book(other, 1);
    const sup = await supervisor(["confirm_bookings", "cancel_bookings", "send_announcements", "take_attendance"], id);

    expect((await cancelBooking(sup.user, target.id, ctx)).ok).toBe(false);
    expect((await db.select().from(bookings).where(eq(bookings.id, target.id)))[0].status).toBe("confirmed");
    await expect(sendAnnouncement(sup.user, other, { audience: "all", body: "x" }, ctx)).rejects.toThrow(ForbiddenError);
    expect((await syncAttendance(sup.user, other, [])).ok).toBe(false);

    const posted = await sendAnnouncement(admin, other, { audience: "all", body: "x" }, ctx);
    if (!posted.ok) throw new Error(posted.error);
    await expect(deleteAnnouncement(sup.user, posted.id, ctx)).rejects.toThrow(ForbiddenError);
  });

  it("a bus supervisor can't touch students on another bus", async () => {
    const id = await newTrip({ date: daysFromToday(5), busesEnabled: true, supervisorScope: "bus" });
    const a = await book(id, 1);
    const b = await book(id, 2);
    await createBus(admin, id, { name: "1", capacity: 40 }, ctx);
    await createBus(admin, id, { name: "2", capacity: 40 }, ctx);
    const [bus1, bus2] = await listBuses(id);
    await assignBus(admin, a.id, bus1.id, ctx);
    await assignBus(admin, b.id, bus2.id, ctx);
    const sup = await supervisor(["cancel_bookings", "confirm_bookings"], id);
    await setSupervisorBus(admin, id, sup.id, bus1.id, ctx);

    expect((await cancelBooking(sup.user, b.id, ctx)).ok).toBe(false);
    expect((await confirmBooking(sup.user, b.id, ctx)).ok).toBe(false);
    await expect(assignBus(sup.user, b.id, bus1.id, ctx)).rejects.toThrow(ForbiddenError);
  });

  it("a student only sees their own trips", async () => {
    const id = await newTrip({ date: daysFromToday(5) });
    const other = await newTrip({ date: daysFromToday(6), title: "تانية" });
    const mine = await book(id, 1);
    await book(other, 2);
    expect(await getStudentTrip(mine.studentId, other)).toBeNull();
    expect(await getStudentTrip(mine.studentId, id)).not.toBeNull();
  });
});

describe("privilege escalation", () => {
  it("keeps admin-only tools away from supervisors and system tools away from admins", async () => {
    const id = await newTrip();
    const sup = await supervisor(["view_trip_dashboard", "take_attendance"], id);
    await expect(tripReport(sup.user, (await getTrip(id))!)).rejects.toThrow(ForbiddenError);
    await expect(purgeTrip(sup.user, id, "x", ctx)).rejects.toThrow(ForbiddenError);
    await expect(updateSettings(admin, { restore_absent_student: "allowed" }, ctx)).rejects.toThrow(ForbiddenError);
    await expect(createAdmin(admin, { name: "أدمن", username: "evil", password: "password123" }, ctx)).rejects.toThrow(ForbiddenError);
  });

  it("drops a frozen supervisor's open session at once", async () => {
    const sup = await supervisor(["take_attendance"]);
    expect(await getSessionUser(sup.token)).not.toBeNull();
    await setSupervisorActive(admin, sup.id, false, ctx);
    expect(await getSessionUser(sup.token)).toBeNull();
  });
});

describe("brute force", () => {
  it("locks staff login after 5 wrong passwords, even with the right one after", async () => {
    await supervisor([], undefined, "target");
    for (let i = 0; i < 5; i++) expect((await authenticate("target", `wrong${i}`, ctx)).ok).toBe(false);
    const r = await authenticate("target", "password123", ctx);
    expect(r).toMatchObject({ ok: false, reason: "locked" });
  });

  it("locks a phone number after 5 wrong student logins", async () => {
    const id = await newTrip({ date: daysFromToday(5) });
    const b = await book(id, 1);
    expect(b.status).toBe("confirmed");
    for (let i = 0; i < 5; i++) await authenticateStudent("01012340001", nationalId(90 + i), ctx);
    expect(await authenticateStudent("01012340001", nationalId(1), ctx)).toMatchObject({ ok: false, reason: "locked" });
  });

  it("refuses bookings through the link of a closed or started trip", async () => {
    const id = await newTrip({ date: daysFromToday(5) });
    const trip = (await getTrip(id))!;
    expect((await submitPublicBooking(trip.publicToken, studentInput(5, facultyId), ctx)).ok).toBe(false);
    await setBookingOpen(admin, id, true, ctx);
    expect((await submitPublicBooking(trip.publicToken, studentInput(5, facultyId), ctx)).ok).toBe(true);
    expect((await submitPublicBooking("x".repeat(20), studentInput(6, facultyId), ctx)).ok).toBe(false);
  });
});
