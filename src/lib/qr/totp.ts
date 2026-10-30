/**
 * Attendance QR codes (plan §7): RFC 6238 TOTP over a per-booking (or per-supervisor)
 * secret, a new code every 30 seconds. Runs on Web Crypto, so the student's phone
 * computes the same codes offline that the server checks.
 *
 * QR text: `ZNU1:B:<bookingId>:<code>` for students, `ZNU1:S:<userId>:<code>` for supervisors.
 * No personal data is encoded.
 */

export const QR_STEP_SECONDS = 30;
export const QR_DIGITS = 8;
/** Codes from one step before and after are accepted, for clock drift between phones. */
export const QR_WINDOW = 1;

export type QrKind = "B" | "S";

export function base64UrlToBytes(value: string): Uint8Array<ArrayBuffer> {
  const b64 = value.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

export const counterAt = (ms: number) => Math.floor(ms / 1000 / QR_STEP_SECONDS);

/** Seconds left before the code shown at `ms` changes. */
export const secondsLeft = (ms: number) => QR_STEP_SECONDS - (Math.floor(ms / 1000) % QR_STEP_SECONDS);

export async function totp(secret: string, counter: number): Promise<string> {
  const key = await crypto.subtle.importKey("raw", base64UrlToBytes(secret), { name: "HMAC", hash: "SHA-1" }, false, ["sign"]);
  const msg = new ArrayBuffer(8);
  const view = new DataView(msg);
  view.setUint32(0, Math.floor(counter / 2 ** 32));
  view.setUint32(4, counter >>> 0);
  const mac = new Uint8Array(await crypto.subtle.sign("HMAC", key, msg));
  const offset = mac[mac.length - 1] & 0x0f;
  const bin =
    ((mac[offset] & 0x7f) << 24) | (mac[offset + 1] << 16) | (mac[offset + 2] << 8) | mac[offset + 3];
  return String(bin % 10 ** QR_DIGITS).padStart(QR_DIGITS, "0");
}

export async function verifyTotp(secret: string, code: string, atMs: number, window = QR_WINDOW): Promise<boolean> {
  if (!new RegExp(`^\\d{${QR_DIGITS}}$`).test(code)) return false;
  const c = counterAt(atMs);
  for (let d = -window; d <= window; d++) {
    if ((await totp(secret, c + d)) === code) return true;
  }
  return false;
}

export const qrPayload = (kind: QrKind, id: number, code: string) => `ZNU1:${kind}:${id}:${code}`;

export function parseQrPayload(text: string): { kind: QrKind; id: number; code: string } | null {
  const m = /^ZNU1:([BS]):(\d{1,10}):(\d+)$/.exec(text.trim());
  if (!m) return null;
  const id = Number(m[2]);
  if (!Number.isSafeInteger(id) || id <= 0) return null;
  return { kind: m[1] as QrKind, id, code: m[3] };
}
