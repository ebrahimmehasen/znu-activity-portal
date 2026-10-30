export const CAIRO_TZ = "Africa/Cairo";

/** Today's date in Cairo as YYYY-MM-DD (trip dates are stored as plain dates). */
export function cairoToday(now = new Date()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: CAIRO_TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

const wallFmt = new Intl.DateTimeFormat("en-US", {
  timeZone: CAIRO_TZ,
  hourCycle: "h23",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
});

/** Cairo wall-clock time of `d`, read back as if it were UTC (for offset math). */
function cairoWallAsUtc(d: Date) {
  const p = Object.fromEntries(wallFmt.formatToParts(d).map((x) => [x.type, x.value]));
  return Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second);
}

/** The instant of a Cairo date + "HH:MM[:SS]" (handles daylight saving). */
export function cairoInstant(isoDate: string, time: string) {
  const [y, mo, d] = isoDate.split("-").map(Number);
  const [h, mi, s = 0] = time.split(":").map(Number);
  const target = Date.UTC(y, mo - 1, d, h, mi, s);
  let guess = target;
  for (let i = 0; i < 2; i++) guess = target - (cairoWallAsUtc(new Date(guess)) - guess);
  return new Date(guess);
}

const clockFmt = new Intl.DateTimeFormat("ar-EG", { timeZone: CAIRO_TZ, hour: "numeric", minute: "2-digit" });

/** A timestamp as a Cairo clock time, e.g. "٧:٠٥ ص". */
export function formatClock(d: Date | null | undefined) {
  return d ? clockFmt.format(d) : "";
}

export function isValidIsoDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const d = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
}

const dateFmt = new Intl.DateTimeFormat("ar-EG", { dateStyle: "full", timeZone: "UTC" });

export function formatDate(isoDate: string) {
  return dateFmt.format(new Date(`${isoDate}T00:00:00Z`));
}

/** Postgres returns "HH:MM:SS"; the UI and <input type="time"> use "HH:MM". */
export function shortTime(t: string | null | undefined) {
  return t ? t.slice(0, 5) : "";
}

export function formatTime(t: string | null | undefined) {
  if (!t) return "";
  const [h, m] = t.split(":").map(Number);
  const suffix = h < 12 ? "ص" : "م";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m).padStart(2, "0")} ${suffix}`;
}
