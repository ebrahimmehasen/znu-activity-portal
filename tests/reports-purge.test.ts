import ExcelJS from "exceljs";
import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/db";
import { activities, attendances, auditLogs, bookings, students } from "@/db/schema";
import { endTrip, listCheckpoints, markAbsent, startTrip, syncAttendance } from "@/lib/attendance/service";
import { createSession, getSessionUser, type SessionUser } from "@/lib/auth/service";
import { addManualBooking, cancelBooking } from "@/lib/bookings/service";
import { ForbiddenError } from "@/lib/errors";
import { purgeStudent, purgeTrip, searchStudents } from "@/lib/purge/service";
import { tripReport } from "@/lib/reports/service";
import { reportWorkbook } from "@/lib/reports/xlsx";
import { createSupervisor } from "@/lib/supervisors/service";
import { createTrip, getTrip, type TripInput } from "@/lib/trips/service";
import { createFaculty, createUser, ctx, daysFromToday, nationalId, resetDb, studentInput, tripInput } from "./helpers";

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

/** Three students: two present, one absent, then the trip ends. */
async function finishedTrip() {
  const id = await newTrip();
  const [a, b, c] = [await book(id, 1), await book(id, 2), await book(id, 3)];
  await startTrip(admin, id, ctx);
  const [cp] = await listCheckpoints(id);
  const manual = (bookingId: number) => ({ kind: "student", clientUuid: crypto.randomUUID(), checkpointId: cp.id, bookingId, method: "manual", recordedAt: Date.now() });
  await syncAttendance(admin, id, [manual(a.id), manual(b.id)]);
  await markAbsent(admin, cp.id, c.id, ctx);
  await endTrip(admin, id, ctx);
  return { id, a, b, c };
}

async function supervisor() {
  const r = await createSupervisor(admin, { name: "مشرف", username: "sup1", password: "password123", permissions: ["view_trip_dashboard"] }, ctx);
  if (!r.ok) throw new Error("sup");
  return (await getSessionUser((await createSession(r.id!, ctx)).token))!;
}

beforeEach(async () => {
  await resetDb();
  admin = await createUser("admin");
  facultyId = (await createFaculty()).id;
});

describe("trip report", () => {
  it("summarises bookings and attendance and lists each gathering's state", async () => {
    const { id } = await finishedTrip();
    await book(await newTrip({ title: "تانية" }), 9); // other trips don't count
    const r = await tripReport(admin, (await getTrip(id))!);
    const summary = Object.fromEntries(r.summary);
    expect(summary).toMatchObject({ "إجمالي الطلبات": 3, "المؤكد": 3, "الملغي": 0, "الحاضر فعليًا": 2, "الغياب": 1, "الحالة": "انتهت" });
    expect(r.checkpoints).toHaveLength(1);
    expect(r.checkpoints[0].tally).toMatchObject({ present: 2, absent: 1, total: 3 });
    expect(r.rows).toHaveLength(3);
    expect(r.rows.map((x) => x.cells[0].split(" ")[0]).sort()).toEqual(["حاضر", "حاضر", "غياب"]);
  });

  it("is for admins only", async () => {
    const { id } = await finishedTrip();
    await expect(tripReport(await supervisor(), (await getTrip(id))!)).rejects.toThrow(ForbiddenError);
  });

  it("builds a right-to-left workbook with a summary and the roster", async () => {
    const { id } = await finishedTrip();
    const buf = await reportWorkbook(await tripReport(admin, (await getTrip(id))!));
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buf as unknown as ArrayBuffer);
    expect(wb.worksheets.map((w) => w.name)).toEqual(["الملخص", "الكشف"]);
    const roster = wb.getWorksheet("الكشف")!;
    expect(roster.views[0].rightToLeft).toBe(true);
    expect(roster.getRow(1).values).toEqual([undefined, "#", "الاسم", "الكلية", "الفرقة", "الهاتف", "التجمع الأول"]);
    expect(roster.rowCount).toBe(4);
    expect(roster.getRow(2).getCell(5).value).toMatch(/^01/);
  });
});

describe("manual data deletion", () => {
  it("wipes a finished trip only, after typing its title", async () => {
    const live = await newTrip();
    await book(live, 7);
    await startTrip(admin, live, ctx);
    expect(await purgeTrip(admin, live, "رحلة الإسكندرية", ctx)).toEqual({ ok: false, error: "المسح للرحلات المنتهية بس" });

    const { id } = await finishedTrip();
    expect((await purgeTrip(admin, id, "رحلة غلط", ctx)).ok).toBe(false);
    expect(await purgeTrip(admin, id, " رحلة الإسكندرية ", ctx)).toEqual({ ok: true });
    expect(await db.select().from(activities).where(eq(activities.id, id))).toEqual([]);
    expect(await db.select().from(bookings).where(eq(bookings.activityId, id))).toEqual([]);
    expect(await db.select().from(attendances)).toEqual([]);
    const [log] = await db.select().from(auditLogs).where(eq(auditLogs.action, "activity.purged"));
    expect(log.meta).toMatchObject({ title: "رحلة الإسكندرية", bookings: 3 });
  });

  it("finds students by name, phone or national ID", async () => {
    const id = await newTrip();
    await book(id, 1);
    await book(id, 2);
    expect(await searchStudents(admin, "01")).toEqual([]);
    expect(await searchStudents(admin, "01012340001")).toHaveLength(1);
    expect(await searchStudents(admin, nationalId(2))).toHaveLength(1);
    expect((await searchStudents(admin, "محمد")).length).toBe(2);
    expect(await searchStudents(admin, "%%%")).toEqual([]);
  });

  it("wipes a student after typing the word, unless they hold a live booking", async () => {
    const id = await newTrip({ date: daysFromToday(5) });
    const b = await book(id, 1);
    expect((await purgeStudent(admin, b.studentId, "لا", ctx)).ok).toBe(false);
    expect(await purgeStudent(admin, b.studentId, "مسح", ctx)).toEqual({ ok: false, error: "الطالب عنده حجز في رحلة لسه مخلصتش. الغي الحجز الأول" });

    await cancelBooking(admin, b.id, ctx);
    expect(await purgeStudent(admin, b.studentId, "مسح", ctx)).toEqual({ ok: true });
    expect(await db.select().from(students).where(eq(students.id, b.studentId))).toEqual([]);
    expect(await db.select().from(bookings).where(eq(bookings.studentId, b.studentId))).toEqual([]);
    const [log] = await db.select().from(auditLogs).where(eq(auditLogs.action, "student.purged"));
    expect(log.meta).toEqual({ bookings: 1 });
  });

  it("allows wiping someone whose trips are all finished", async () => {
    const { a } = await finishedTrip();
    expect(await purgeStudent(admin, a.studentId, "مسح", ctx)).toEqual({ ok: true });
  });

  it("is for admins only", async () => {
    const sup = await supervisor();
    await expect(searchStudents(sup, "محمد")).rejects.toThrow(ForbiddenError);
    await expect(purgeTrip(sup, 1, "x", ctx)).rejects.toThrow(ForbiddenError);
    await expect(purgeStudent(sup, 1, "مسح", ctx)).rejects.toThrow(ForbiddenError);
  });
});
