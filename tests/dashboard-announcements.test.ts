import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/db";
import { auditLogs, bookings, type SupervisorPermission } from "@/db/schema";
import {
  deleteAnnouncement,
  listStaffAnnouncements,
  listStudentAnnouncements,
  markStaffRead,
  markStudentRead,
  sendAnnouncement,
  staffUnreadCount,
  studentUnreadCount,
} from "@/lib/announcements/service";
import { tripDashboard } from "@/lib/attendance/dashboard";
import { addCheckpoint, listCheckpoints, lockRoster, markAbsent, setCheckpointOpen, startTrip, syncAttendance } from "@/lib/attendance/service";
import { createSession, getSessionUser, type SessionUser } from "@/lib/auth/service";
import { addManualBooking, cancelBooking } from "@/lib/bookings/service";
import { assignBus, createBus, listBuses } from "@/lib/buses/service";
import { ForbiddenError } from "@/lib/errors";
import { assignSupervisor, setSupervisorBus } from "@/lib/supervisors/assignments";
import { createSupervisor } from "@/lib/supervisors/service";
import { createTrip, getTrip, type TripInput } from "@/lib/trips/service";
import { createFaculty, createUser, ctx, daysFromToday, resetDb, studentInput, tripInput } from "./helpers";

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

async function newSupervisor(permissions: SupervisorPermission[], tripId?: number) {
  const r = await createSupervisor(admin, { name: "مشرف", username: `s${Math.random().toString(36).slice(2, 8)}`, password: "password123", permissions }, ctx);
  if (!r.ok) throw new Error("sup");
  if (tripId) await assignSupervisor(admin, tripId, r.id!, ctx);
  const { token } = await createSession(r.id!, ctx);
  return (await getSessionUser(token))!;
}

const manual = (checkpointId: number, bookingId: number) => ({
  kind: "student",
  clientUuid: crypto.randomUUID(),
  checkpointId,
  bookingId,
  method: "manual",
  recordedAt: Date.now(),
});

beforeEach(async () => {
  await resetDb();
  admin = await createUser("admin");
  facultyId = (await createFaculty()).id;
});

describe("trip dashboard", () => {
  it("counts each gathering and leaves final absentees out of later ones", async () => {
    const id = await newTrip();
    const [a, b, c] = [await book(id, 1), await book(id, 2), await book(id, 3)];
    await startTrip(admin, id, ctx);
    const [cp1] = await listCheckpoints(id);
    await syncAttendance(admin, id, [manual(cp1.id, a.id), manual(cp1.id, b.id)]);
    await markAbsent(admin, cp1.id, c.id, ctx);

    let d = await tripDashboard(admin, (await getTrip(id))!);
    expect(d.confirmed).toBe(3);
    expect(d.totals[0]).toMatchObject({ present: 2, absent: 1, unrecorded: 0, total: 3 });

    expect((await lockRoster(admin, id, ctx)).ok).toBe(true);
    expect((await addCheckpoint(admin, id, { name: "بعد الغدا", time: "23:59" }, ctx)).ok).toBe(true);
    const cp2 = (await listCheckpoints(id))[1];
    await setCheckpointOpen(admin, cp2.id, true, ctx);
    const r = await syncAttendance(admin, id, [manual(cp2.id, a.id)]);
    expect(r.ok && r.outcomes[0].result).toBe("recorded");

    d = await tripDashboard(admin, (await getTrip(id))!);
    expect(d.finalAbsent).toBe(1);
    expect(d.totals[1]).toMatchObject({ present: 1, unrecorded: 1, total: 2 });
    expect(d.rows.find((r) => r.bookingId === c.id)!.cells).toEqual(["absent", null]);
    expect(d.checkpoints.map((x) => x.open)).toEqual([false, true]);
  });

  it("splits by bus for admins and limits a bus supervisor to their bus", async () => {
    const id = await newTrip({ busesEnabled: true, supervisorScope: "bus" });
    const [a, b] = [await book(id, 1), await book(id, 2)];
    await createBus(admin, id, { name: "أتوبيس 1", capacity: 50 }, ctx);
    await createBus(admin, id, { name: "أتوبيس 2", capacity: 50 }, ctx);
    const [bus1, bus2] = await listBuses(id);
    await assignBus(admin, a.id, bus1.id, ctx);
    await assignBus(admin, b.id, bus2.id, ctx);
    const sup = await newSupervisor(["view_trip_dashboard"], id);
    await setSupervisorBus(admin, id, sup.id, bus1.id, ctx);
    await startTrip(admin, id, ctx);
    const trip = (await getTrip(id))!;

    const full = await tripDashboard(admin, trip);
    expect(full.groups.map((g) => [g.label, g.count])).toEqual([
      ["أتوبيس 1", 1],
      ["أتوبيس 2", 1],
    ]);

    const mine = await tripDashboard(sup, trip);
    expect(mine.rows.map((r) => r.bookingId)).toEqual([a.id]);
    expect(mine.groups).toEqual([]);
    expect(mine.scopedToBus).toBe(true);
  });

  it("needs the dashboard permission", async () => {
    const id = await newTrip();
    const sup = await newSupervisor(["take_attendance"], id);
    await expect(tripDashboard(sup, (await getTrip(id))!)).rejects.toThrow(ForbiddenError);
  });
});

describe("announcements", () => {
  it("validates, records the sender as reader and audits", async () => {
    const id = await newTrip();
    expect(await sendAnnouncement(admin, id, { audience: "all", body: "   " }, ctx)).toEqual({ ok: false, error: "أدخل نص الإعلان" });
    expect((await sendAnnouncement(admin, id, { audience: "everyone", body: "x" }, ctx)).ok).toBe(false);
    const r = await sendAnnouncement(admin, id, { audience: "all", body: "التحرك الساعة 7" }, ctx);
    expect(r.ok).toBe(true);
    expect(await staffUnreadCount(admin)).toBe(0);
    const [row] = await listStaffAnnouncements(admin, id);
    expect(row).toMatchObject({ body: "التحرك الساعة 7", read: true, senderName: admin.name, tripTitle: "رحلة الإسكندرية" });
    expect(await db.select().from(auditLogs).where(eq(auditLogs.action, "announcement.sent"))).toHaveLength(1);
  });

  it("reaches supervisors on visible trips and confirmed students for 'all' only", async () => {
    const id = await newTrip();
    const other = await newTrip({ title: "رحلة تانية" });
    const confirmed = await book(id, 1);
    const cancelled = await book(id, 2);
    await cancelBooking(admin, cancelled.id, ctx);
    const sup = await newSupervisor([], id);
    const outsider = await newSupervisor([], other);

    await sendAnnouncement(admin, id, { audience: "supervisors", body: "للمشرفين" }, ctx);
    await sendAnnouncement(admin, id, { audience: "all", body: "للكل" }, ctx);

    expect(await staffUnreadCount(sup)).toBe(2);
    expect(await staffUnreadCount(outsider)).toBe(0);
    expect(await listStaffAnnouncements(outsider)).toEqual([]);

    expect(await studentUnreadCount(confirmed.studentId)).toBe(1);
    expect((await listStudentAnnouncements(confirmed.studentId)).map((x) => x.body)).toEqual(["للكل"]);
    expect(await studentUnreadCount(cancelled.studentId)).toBe(0);

    const ids = (await listStaffAnnouncements(sup)).map((x) => x.id);
    await markStaffRead(sup, ids);
    expect(await staffUnreadCount(sup)).toBe(0);
    await markStudentRead(confirmed.studentId, ids);
    expect(await studentUnreadCount(confirmed.studentId)).toBe(0);
    // Marking something not visible does nothing.
    await markStudentRead(cancelled.studentId, ids);
    expect(await listStudentAnnouncements(cancelled.studentId)).toEqual([]);
  });

  it("lets supervisors send only with the permission and delete only their own", async () => {
    const id = await newTrip();
    const plain = await newSupervisor([], id);
    await expect(sendAnnouncement(plain, id, { audience: "all", body: "x" }, ctx)).rejects.toThrow(ForbiddenError);

    const sender = await newSupervisor(["send_announcements"], id);
    const other = await newSupervisor(["send_announcements"], id);
    const r = await sendAnnouncement(sender, id, { audience: "supervisors", body: "من المشرف" }, ctx);
    if (!r.ok) throw new Error(r.error);
    const adminPost = await sendAnnouncement(admin, id, { audience: "all", body: "من الأدمن" }, ctx);
    if (!adminPost.ok) throw new Error(adminPost.error);

    await expect(deleteAnnouncement(other, r.id, ctx)).rejects.toThrow(ForbiddenError);
    await expect(deleteAnnouncement(sender, adminPost.id, ctx)).rejects.toThrow(ForbiddenError);
    expect(await deleteAnnouncement(sender, r.id, ctx)).toEqual({ ok: true });
    expect(await deleteAnnouncement(admin, adminPost.id, ctx)).toEqual({ ok: true });
    expect(await listStaffAnnouncements(admin, id)).toEqual([]);
  });

  it("refuses trips the supervisor can't see", async () => {
    const id = await newTrip();
    const other = await newTrip();
    const sup = await newSupervisor(["send_announcements"], other);
    await expect(sendAnnouncement(sup, id, { audience: "all", body: "x" }, ctx)).rejects.toThrow(ForbiddenError);
  });
});
