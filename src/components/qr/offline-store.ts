/**
 * Device-side copy of the QR secrets so the code works with no network (plan §7).
 * Cleared on logout; the server re-sends the current set on every online visit.
 */
export const STUDENT_QR_KEY = "znu.qr.student.v1";
export const STAFF_QR_KEY = "znu.qr.staff.v1";

export type Stored<T> = { savedAt: number; data: T };

export function readStored<T>(key: string): Stored<T> | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as Stored<T>) : null;
  } catch {
    return null;
  }
}

export function writeStored<T>(key: string, data: T) {
  try {
    localStorage.setItem(key, JSON.stringify({ savedAt: Date.now(), data } satisfies Stored<T>));
  } catch {
    // Private mode or full storage: the QR still works while online.
  }
}

export function clearStored(key: string) {
  try {
    localStorage.removeItem(key);
  } catch {}
}

/** Fetches fresh data; null when offline, "signed-out" when the session is gone. */
export async function fetchQrData<T>(url: string): Promise<T | "signed-out" | null> {
  try {
    const res = await fetch(url, { cache: "no-store", credentials: "same-origin" });
    if (res.status === 401) return "signed-out";
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

/** Asks the service worker to keep a page and its assets for offline use. */
export function warmOffline(paths: string[]) {
  if (!("serviceWorker" in navigator)) return;
  navigator.serviceWorker.ready.then((reg) => reg.active?.postMessage({ type: "warm", paths })).catch(() => {});
}

/** Drops the cached offline pages (logout on a shared phone). */
export async function clearOfflinePages() {
  if (!("caches" in window)) return;
  try {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k.startsWith("znu-pages")).map((k) => caches.delete(k)));
  } catch {}
}
