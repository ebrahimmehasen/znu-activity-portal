import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/db";
import { bookings, users } from "@/db/schema";
import type { SessionUser } from "@/lib/auth/service";
import { addManualBooking, cancelBooking, setBookingOpen, submitPublicBooking } from "@/lib/bookings/service";
import { checkBookingCode, checkSupervisorCode, decryptSecret, encryptSecret, ensureUserSecret } from "@/lib/qr/secrets";
import { counterAt, parseQrPayload, qrPayload, totp, verifyTotp } from "@/lib/qr/totp";
import { updateSettings } from "@/lib/settings/service";
import {
  authenticateStudent,
  createStudentSession,
  deleteStudentSession,
  getStudentSession,
  getStudentTrip,
  listStudentTrips,
  offlineQrData,
} from "@/lib/students/auth";
import { createSupervisor, deleteSupervisor, setSupervisorActive } from "@/lib/supervisors/service";
import { createTrip, getTrip } from "@/lib/trips/service";
import { createFaculty, createUser, ctx, daysFromToday, resetDb, studentInput, tripInput } from "./helpers";

// RFC 6238 appendix B secret ("12345678901234567890"), SHA-1, 8 digits.
const RFC_SECRET = Buffer.from("12345678901234567890").toString("base64url");

describe("TOTP", () => {
  it("matches the RFC 6238 test vectors", async () => {
    expect(await totp(RFC_SECRET, counterAt(59_000))).toBe("94287082");
    expect(await totp(RFC_SECRET, counterAt(1_111_111_109_000))).toBe("07081804");
    expect(await totp(RFC_SECRET, counterAt(20_000_000_000_000))).toBe("65353130");
  });

  it("accepts one step of drift either way, and nothing older", async () => {
    const now = 1_800_000_000_000;
    const code = await totp(RFC_SECRET, counterAt(now));
    expect(await verifyTotp(RFC_SECRET, code, now + 30_000)).toBe(true);
    expect(await verifyTotp(RFC_SECRET, code, now - 30_000)).toBe(true);
    expect(await verifyTotp(RFC_SECRET, code, now + 61_000)).toBe(false);
    expect(await verifyTotp(RFC_SECRET, "12ab5678", now)).toBe(false);
  });

  it("round-trips the QR text without personal data", () => {
    const text = qrPayload("B", 42, "01234567");
    expect(text).toBe("ZNU1:B:42:01234567");
    expect(parseQrPayload(text)).toEqual({ kind: "B", id: 42, code: "01234567" });
    expect(parseQrPayload("ZNU1:X:42:1")).toBeNull();
    expect(parseQrPayload("ZNU1:B:0:1")).toBeNull();
  });

  it("encrypts secrets with a fresh IV and detects tampering", () => {
    const a = encryptSecret("secret");
    expect(a).not.toBe(encryptSecret("secret"));
    expect(decryptSecret(a)).toBe("secret");
    const parts = a.split(".");
    parts[3] = Buffer.from("other").toString("base64url");
    expect(() => decryptSecret(parts.join("."))).toThrow();
  });
});

describe("student portal", () => {
  let admin: SessionUser;
  let facultyId: number;

  async function openTrip(overrides = {}) {
    const r = await createTrip(admin, tripInput(overrides), ctx);
    if (!r.ok) throw new Error("trip");
    await setBookingOpen(admin, r.id, true, ctx);
    return (await getTrip(r.id))!;
  }

  const creds = (n: number) => studentInput(n, facultyId) as { phone: string; nationalId: string };

  const login = (n: number, ip = "10.0.0.9", over: { phone?: string; nationalId?: string } = {}) =>
    authenticateStudent(over.phone ?? creds(n).phone, over.nationalId ?? creds(n).nationalId, {
      ip,
      userAgent: "vitest",
    });

  beforeEach(async () => {
    await resetDb();
    admin = await createUser("admin");
    facultyId = (await createFaculty()).id;
  });

  describe("login", () => {
    it("logs in with phone + national ID of a student who booked", async () => {
      const trip = await openTrip();
      await submitPublicBooking(trip.publicToken, studentInput(1, facultyId), ctx);
      const r = await login(1);
      expect(r).toMatchObject({ ok: true, student: { name: "محمد أحمد علي حسن" } });

      // Arabic-Indic digits work too.
      const arabic = (s: string) => s.replace(/\d/g, (d) => "٠١٢٣٤٥٦٧٨٩"[Number(d)]);
      expect((await login(1, "10.0.0.9", { phone: arabic(creds(1).phone) })).ok).toBe(true);
    });

    it("rejects a wrong pair or a student with no booking", async () => {
      const trip = await openTrip();
      await submitPublicBooking(trip.publicToken, studentInput(1, facultyId), ctx);
      expect(await login(1, "10.0.0.9", { phone: creds(2).phone })).toEqual({ ok: false, reason: "invalid" });
      expect(await login(7)).toEqual({ ok: false, reason: "invalid" });
    });

    it("locks a phone for 15 minutes after 5 wrong attempts", async () => {
      const trip = await openTrip();
      await submitPublicBooking(trip.publicToken, studentInput(1, facultyId), ctx);
      const wrong = { nationalId: creds(2).nationalId };
      for (let i = 0; i < 4; i++) expect((await login(1, "10.0.0.9", wrong)).ok).toBe(false);
      expect(await login(1, "10.0.0.9", wrong)).toMatchObject({ ok: false, reason: "locked" });
      // Even the right national ID is refused while locked.
      expect(await login(1)).toMatchObject({ ok: false, reason: "locked" });
    });

    it("honours the setting for students without a confirmed booking", async () => {
      const trip = await openTrip();
      await submitPublicBooking(trip.publicToken, studentInput(1, facultyId), ctx);
      const superAdmin = await createUser("super_admin");
      await updateSettings(superAdmin, { student_login_non_confirmed: "denied" }, ctx);
      expect(await login(1)).toEqual({ ok: false, reason: "not_confirmed" });

      await addManualBooking(admin, (await openTrip({ date: daysFromToday(20) })).id, studentInput(1, facultyId), ctx);
      expect((await login(1)).ok).toBe(true);
    });

    it("sessions resolve to the student until logout", async () => {
      const trip = await openTrip();
      await submitPublicBooking(trip.publicToken, studentInput(1, facultyId), ctx);
      const r = await login(1);
      if (!r.ok) throw new Error("login");
      const token = await createStudentSession(r.student.id, ctx);
      expect((await getStudentSession(token))?.id).toBe(r.student.id);
      expect(await getStudentSession("forged")).toBeNull();
      await deleteStudentSession(token);
      expect(await getStudentSession(token)).toBeNull();
    });
  });

  describe("trips and QR", () => {
    it("lists only the student's own trips", async () => {
      const mine = await openTrip({ title: "رحلتي" });
      await openTrip({ title: "رحلة غيري", date: daysFromToday(20) });
      const r = await addManualBooking(admin, mine.id, studentInput(1, facultyId), ctx);
      if (!r.ok) throw new Error("book");
      const [{ studentId }] = await db.select({ studentId: bookings.studentId }).from(bookings);

      expect((await listStudentTrips(studentId)).map((t) => t.trip.title)).toEqual(["رحلتي"]);
      expect(await getStudentTrip(studentId, mine.id + 1)).toBeNull();
    });

    it("hands out a stable secret for confirmed bookings only", async () => {
      const trip = await openTrip();
      await submitPublicBooking(trip.publicToken, studentInput(1, facultyId), ctx);
      const [{ studentId }] = await db.select({ studentId: bookings.studentId }).from(bookings);
      expect(await offlineQrData(studentId)).toEqual([]);

      await addManualBooking(admin, (await openTrip({ date: daysFromToday(20) })).id, studentInput(1, facultyId), ctx);
      const [first] = await offlineQrData(studentId);
      const [again] = await offlineQrData(studentId);
      expect(first.secret).toHaveLength(27);
      expect(again.secret).toBe(first.secret);

      const [stored] = await db.select({ s: bookings.qrSecret }).from(bookings).where(eq(bookings.id, first.bookingId));
      expect(stored.s).not.toContain(first.secret);
    });

    it("cancelling a booking revokes its QR codes", async () => {
      const trip = await openTrip();
      const r = await addManualBooking(admin, trip.id, studentInput(1, facultyId), ctx);
      if (!r.ok) throw new Error("book");
      const [{ studentId }] = await db.select({ studentId: bookings.studentId }).from(bookings);
      const [qr] = await offlineQrData(studentId);
      const now = Date.now();
      const code = await totp(qr.secret, counterAt(now));
      expect(await checkBookingCode(qr.bookingId, code, now)).toBe("ok");
      expect(await checkBookingCode(qr.bookingId, "00000000", now)).toBe("invalid");

      await cancelBooking(admin, qr.bookingId, ctx);
      expect(await checkBookingCode(qr.bookingId, code, now)).toBe("revoked");
      expect(await offlineQrData(studentId)).toEqual([]);

      // Re-adding the student issues a new secret; the old codes stay dead.
      await addManualBooking(admin, trip.id, studentInput(1, facultyId), ctx);
      const [fresh] = await offlineQrData(studentId);
      expect(fresh.secret).not.toBe(qr.secret);
      expect(await checkBookingCode(qr.bookingId, code, now)).toBe("invalid");
    });

    it("supervisor codes stop working when frozen or deleted", async () => {
      const r = await createSupervisor(admin, { name: "مشرف", username: "qrsup", password: "password123" }, ctx);
      const id = r.id!;
      const secret = (await ensureUserSecret(id))!;
      expect(await ensureUserSecret(id)).toBe(secret);
      const now = Date.now();
      const code = await totp(secret, counterAt(now));
      expect(await checkSupervisorCode(id, code, now)).toBe("ok");
      expect(await checkSupervisorCode(admin.id, code, now)).toBe("revoked");

      await setSupervisorActive(admin, id, false, ctx);
      expect(await checkSupervisorCode(id, code, now)).toBe("revoked");
      await setSupervisorActive(admin, id, true, ctx);
      await deleteSupervisor(admin, id, ctx);
      const [u] = await db.select({ s: users.qrSecret }).from(users).where(eq(users.id, id));
      expect(u.s).toBeNull();
    });
  });
});
