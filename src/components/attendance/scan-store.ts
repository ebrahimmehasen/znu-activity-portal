/**
 * Device-side storage for the offline scanner (plan §6.1):
 * - the trip pack (roster names, gatherings) in localStorage, per trip;
 * - every scan / manual mark in IndexedDB until the server answers it.
 * A small counter of unsent records lives in localStorage so logout can warn synchronously.
 */
import type { SyncOutcome, SyncResult } from "@/lib/attendance/service";

export const SCAN_PACK_PREFIX = "znu.scan.v1.";
export const UNSENT_KEY = "znu.scan.unsent";
const DB_NAME = "znu-scan";
const STORE = "records";

export type QueuedPayload =
  | { kind: "student"; clientUuid: string; checkpointId: number; bookingId: number; method: "qr" | "manual"; code?: string; recordedAt: number }
  | { kind: "staff"; clientUuid: string; userId: number; method: "qr" | "manual"; code?: string; recordedAt: number };

export type QueuedRecord = {
  clientUuid: string;
  tripId: number;
  name: string;
  payload: QueuedPayload;
  /** "queued" until the server answers; then the answer. */
  state: "queued" | SyncResult;
  message: string;
};

export const packKey = (tripId: number) => `${SCAN_PACK_PREFIX}${tripId}`;

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const store = req.result.createObjectStore(STORE, { keyPath: "clientUuid" });
      store.createIndex("tripId", "tripId");
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function tx<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T> | void): Promise<T | undefined> {
  const db = await open();
  try {
    return await new Promise<T | undefined>((resolve, reject) => {
      const t = db.transaction(STORE, mode);
      const req = run(t.objectStore(STORE));
      t.oncomplete = () => resolve(req ? req.result : undefined);
      t.onerror = () => reject(t.error);
    });
  } finally {
    db.close();
  }
}

export async function listRecords(tripId: number): Promise<QueuedRecord[]> {
  return ((await tx<QueuedRecord[]>("readonly", (s) => s.index("tripId").getAll(tripId))) ?? []).sort(
    (a, b) => a.payload.recordedAt - b.payload.recordedAt,
  );
}

export async function putRecords(records: QueuedRecord[]) {
  if (!records.length) return;
  await tx("readwrite", (s) => {
    for (const r of records) s.put(r);
  });
  await refreshUnsentCount();
}

/** Applies the server's answers to the stored records. */
export async function applyOutcomes(records: QueuedRecord[], outcomes: SyncOutcome[]) {
  const byId = new Map(outcomes.map((o) => [o.clientUuid, o]));
  const updated = records.flatMap((r) => {
    const o = byId.get(r.clientUuid);
    return o ? [{ ...r, state: o.result, message: o.message, name: o.name ?? r.name }] : [];
  });
  await putRecords(updated);
  return updated;
}

async function refreshUnsentCount() {
  const all = (await tx<QueuedRecord[]>("readonly", (s) => s.getAll())) ?? [];
  try {
    localStorage.setItem(UNSENT_KEY, String(all.filter((r) => r.state === "queued").length));
  } catch {}
}

export function unsentCount() {
  try {
    return Number(localStorage.getItem(UNSENT_KEY) ?? 0) || 0;
  } catch {
    return 0;
  }
}

/** Logout on a shared phone: drop every roster copy and record. */
export function clearScanData() {
  try {
    for (const k of Object.keys(localStorage)) if (k.startsWith(SCAN_PACK_PREFIX) || k === UNSENT_KEY) localStorage.removeItem(k);
  } catch {}
  try {
    indexedDB.deleteDatabase(DB_NAME);
  } catch {}
}
