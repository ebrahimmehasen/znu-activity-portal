export const CAIRO_TZ = "Africa/Cairo";

/** Today's date in Cairo as YYYY-MM-DD (trip dates are stored as plain dates). */
export function cairoToday(now = new Date()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: CAIRO_TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
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
