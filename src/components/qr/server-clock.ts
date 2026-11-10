/**
 * Phone clocks can be minutes off, and a QR code is only valid within its 30-second
 * window. Every online response from our server carries its time (the HTTP Date header);
 * the phone keeps the difference and uses the corrected time to generate codes and stamp
 * scans, including later when offline.
 */
const CLOCK_KEY = "znu.clock.v1";

let offsetMs: number | null = null;

function loadOffset() {
  if (offsetMs !== null) return offsetMs;
  try {
    offsetMs = Number(localStorage.getItem(CLOCK_KEY)) || 0;
  } catch {
    offsetMs = 0;
  }
  return offsetMs;
}

/** Now, by the server's clock as last seen. */
export function serverNow() {
  return Date.now() + loadOffset();
}

/** Learns the offset from a response; `sentAt` is Date.now() just before the request. */
export function learnServerTime(res: Response, sentAt: number) {
  const header = res.headers.get("date");
  const server = header ? Date.parse(header) : NaN;
  if (!Number.isFinite(server)) return;
  const receivedAt = Date.now();
  // The Date header has one-second resolution: aim at the middle of that second and of the round trip.
  const offset = server + 500 - (sentAt + receivedAt) / 2;
  // Ignore jitter; a real clock error is seconds to minutes.
  if (Math.abs(offset - loadOffset()) < 1500) return;
  offsetMs = Math.round(offset);
  try {
    localStorage.setItem(CLOCK_KEY, String(offsetMs));
  } catch {}
}
