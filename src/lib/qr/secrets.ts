import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { bookings, users } from "@/db/schema";
import { verifyTotp } from "./totp";

/**
 * QR secrets are stored AES-256-GCM encrypted (`v1.<iv>.<tag>.<data>`, base64url) with
 * QR_ENCRYPTION_KEY, so a database dump alone can't mint attendance codes.
 */

function key() {
  const raw = process.env.QR_ENCRYPTION_KEY;
  const k = raw ? Buffer.from(raw, "base64") : null;
  if (!k || k.length !== 32) throw new Error("QR_ENCRYPTION_KEY must be 32 bytes, base64 encoded");
  return k;
}

export function encryptSecret(plain: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const data = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return ["v1", iv, cipher.getAuthTag(), data].map((p) => (typeof p === "string" ? p : p.toString("base64url"))).join(".");
}

export function decryptSecret(stored: string) {
  const [v, iv, tag, data] = stored.split(".");
  if (v !== "v1" || !iv || !tag || !data) throw new Error("bad secret format");
  const decipher = createDecipheriv("aes-256-gcm", key(), Buffer.from(iv, "base64url"));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(data, "base64url")), decipher.final()]).toString("utf8");
}

const newSecret = () => randomBytes(20).toString("base64url");

/** The booking's plain secret, created on first request. Only call for confirmed bookings. */
export async function ensureBookingSecret(bookingId: number, stored: string | null) {
  if (stored) return decryptSecret(stored);
  const secret = newSecret();
  // Two devices asking at once must end up with the same secret.
  const [row] = await db
    .update(bookings)
    .set({ qrSecret: encryptSecret(secret) })
    .where(and(eq(bookings.id, bookingId), eq(bookings.status, "confirmed"), isNull(bookings.qrSecret)))
    .returning({ id: bookings.id });
  if (row) return secret;
  const [current] = await db.select({ s: bookings.qrSecret }).from(bookings).where(eq(bookings.id, bookingId));
  return current?.s ? decryptSecret(current.s) : null;
}

export async function ensureUserSecret(userId: number) {
  const [user] = await db.select({ s: users.qrSecret }).from(users).where(eq(users.id, userId));
  if (!user) return null;
  if (user.s) return decryptSecret(user.s);
  const secret = newSecret();
  const [row] = await db
    .update(users)
    .set({ qrSecret: encryptSecret(secret) })
    .where(and(eq(users.id, userId), isNull(users.qrSecret)))
    .returning({ id: users.id });
  if (row) return secret;
  return ensureUserSecret(userId);
}

export type QrCheck = "ok" | "invalid" | "revoked";

/**
 * Server-side check of a scanned student code at the moment it was scanned.
 * A cancelled booking has no secret any more, so its old codes are "revoked".
 */
export async function checkBookingCode(bookingId: number, code: string, scannedAtMs: number): Promise<QrCheck> {
  const [b] = await db.select({ status: bookings.status, s: bookings.qrSecret }).from(bookings).where(eq(bookings.id, bookingId));
  if (!b || b.status !== "confirmed" || !b.s) return "revoked";
  return (await verifyTotp(decryptSecret(b.s), code, scannedAtMs)) ? "ok" : "invalid";
}

export async function checkSupervisorCode(userId: number, code: string, scannedAtMs: number): Promise<QrCheck> {
  const [u] = await db
    .select({ s: users.qrSecret, role: users.role, active: users.isActive, deletedAt: users.deletedAt })
    .from(users)
    .where(eq(users.id, userId));
  if (!u || u.role !== "supervisor" || !u.active || u.deletedAt || !u.s) return "revoked";
  return (await verifyTotp(decryptSecret(u.s), code, scannedAtMs)) ? "ok" : "invalid";
}
