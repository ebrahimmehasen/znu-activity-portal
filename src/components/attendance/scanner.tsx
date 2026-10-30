"use client";

import jsQR from "jsqr";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Badge, Button, Input } from "@/components/ui";
import type { ScanPack, SyncOutcome } from "@/lib/attendance/service";
import { parseQrPayload } from "@/lib/qr/totp";
import { fetchQrData, readStored, warmOffline, writeStored } from "@/components/qr/offline-store";
import { applyOutcomes, listRecords, packKey, putRecords, type QueuedPayload, type QueuedRecord } from "./scan-store";

type Tone = "success" | "warning" | "danger" | "neutral";
type Banner = { name?: string; message: string; tone: Tone; clientUuid?: string };

const SYNC_EVERY_MS = 20_000;
const BATCH = 100;
/** The same QR seen again within this window is the same scan, not a repeat. */
const SAME_SCAN_MS = 4_000;

const RESULT_TONES: Record<QueuedRecord["state"], Tone> = {
  queued: "warning",
  recorded: "success",
  pending: "success",
  duplicate: "neutral",
  invalid: "danger",
  revoked: "danger",
  not_in_trip: "danger",
  closed: "danger",
  forbidden: "danger",
  error: "danger",
};

const bannerCls: Record<Tone, string> = {
  success: "border-success/40 bg-success/10 text-success",
  warning: "border-warning/40 bg-warning/10 text-warning",
  danger: "border-danger/40 bg-danger/10 text-danger",
  neutral: "border-border bg-background text-foreground",
};

/** Counts as "already there" for repeat detection on the device. */
const standing = (r: QueuedRecord) => r.state === "queued" || r.state === "recorded" || r.state === "pending" || r.state === "duplicate";

export function Scanner({ tripId }: { tripId: number }) {
  const [pack, setPack] = useState<ScanPack | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [records, setRecords] = useState<QueuedRecord[]>([]);
  const [online, setOnline] = useState(true);
  const [signedOut, setSignedOut] = useState(false);
  const [cpId, setCpId] = useState<number | null>(null);
  const [tab, setTab] = useState<"scan" | "list" | "log">("scan");
  const [banner, setBanner] = useState<Banner | null>(null);
  const [loading, setLoading] = useState(true);
  const syncing = useRef(false);

  const reloadRecords = useCallback(async () => {
    try {
      setRecords(await listRecords(tripId));
    } catch {}
  }, [tripId]);

  const refreshPack = useCallback(async () => {
    setLoading(true);
    const fresh = await fetchQrData<ScanPack>(`/dashboard/trips/${tripId}/scan/data`);
    setLoading(false);
    if (fresh === "signed-out") return setSignedOut(true);
    if (!fresh) return setOnline(false);
    setOnline(true);
    setSignedOut(false);
    writeStored(packKey(tripId), fresh);
    setPack(fresh);
    setSavedAt(Date.now());
    return true;
  }, [tripId]);

  const sync = useCallback(async () => {
    if (syncing.current) return;
    syncing.current = true;
    try {
      const queued = (await listRecords(tripId)).filter((r) => r.state === "queued");
      for (let i = 0; i < queued.length; i += BATCH) {
        const batch = queued.slice(i, i + BATCH);
        let res: Response;
        try {
          res = await fetch(`/dashboard/trips/${tripId}/scan/sync`, {
            method: "POST",
            credentials: "same-origin",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ records: batch.map((r) => r.payload) }),
          });
        } catch {
          setOnline(false);
          return;
        }
        setOnline(true);
        if (res.status === 401) return setSignedOut(true);
        if (!res.ok) return;
        const { outcomes } = (await res.json()) as { outcomes: SyncOutcome[] };
        const updated = await applyOutcomes(batch, outcomes);
        // The banner follows the latest scan once the server has answered it.
        setBanner((b) => {
          const mine = b?.clientUuid && updated.find((u) => u.clientUuid === b.clientUuid);
          return mine ? { name: mine.name, message: mine.message, tone: RESULT_TONES[mine.state], clientUuid: mine.clientUuid } : b;
        });
      }
    } finally {
      syncing.current = false;
      await reloadRecords();
    }
  }, [tripId, reloadRecords]);

  useEffect(() => {
    // localStorage is client-only, so the saved copy is read after hydration.
    queueMicrotask(() => {
      const stored = readStored<ScanPack>(packKey(tripId));
      if (stored) {
        setPack((p) => p ?? stored.data);
        setSavedAt((t) => t ?? stored.savedAt);
      }
      void reloadRecords();
      void refreshPack().then(() => sync());
    });
    const goOnline = () => {
      setOnline(true);
      void sync();
    };
    const goOffline = () => setOnline(false);
    window.addEventListener("online", goOnline);
    window.addEventListener("offline", goOffline);
    const timer = setInterval(() => void sync(), SYNC_EVERY_MS);
    return () => {
      window.removeEventListener("online", goOnline);
      window.removeEventListener("offline", goOffline);
      clearInterval(timer);
    };
  }, [tripId, refreshPack, reloadRecords, sync]);

  const openCps = useMemo(() => pack?.checkpoints.filter((c) => c.open) ?? [], [pack]);
  const cp = pack?.checkpoints.find((c) => c.id === cpId) ?? openCps.at(-1) ?? null;
  const students = useMemo(() => new Map(pack?.students.map((s) => [s.bookingId, s]) ?? []), [pack]);

  const isRecorded = (bookingId: number) =>
    Boolean(cp && (pack?.recorded[cp.id]?.includes(bookingId) || records.some((r) => r.payload.kind === "student" && r.payload.checkpointId === cp.id && r.payload.bookingId === bookingId && standing(r))));

  async function enqueue(name: string, payload: QueuedPayload) {
    const rec: QueuedRecord = { clientUuid: payload.clientUuid, tripId, name, payload, state: "queued", message: "مبدئي – لم يُرفع" };
    try {
      await putRecords([rec]);
    } catch {
      setBanner({ name, message: "مقدرتش أحفظ التسجيل على الموبايل", tone: "danger" });
      return;
    }
    setBanner({ name, message: "اتسجل مبدئيًا – لم يُرفع", tone: "warning", clientUuid: rec.clientUuid });
    navigator.vibrate?.(80);
    await reloadRecords();
    void sync();
  }

  function onStudent(bookingId: number, method: "qr" | "manual", code?: string) {
    if (!cp) return setBanner({ message: "مفيش تجمع مفتوح دلوقتي", tone: "danger" });
    const s = students.get(bookingId);
    if (!s) return setBanner({ message: "الطالب مش في الرحلة (أو مش في أتوبيسك)", tone: "danger" });
    if (s.out && cp.sortOrder > 1) return setBanner({ name: s.name, message: "متعلّم غياب نهائي من التجمع الأول", tone: "danger" });
    if (isRecorded(bookingId)) return setBanner({ name: s.name, message: "مكرر: متسجل قبل كده في التجمع ده", tone: "neutral" });
    void enqueue(s.name, { kind: "student", clientUuid: crypto.randomUUID(), checkpointId: cp.id, bookingId, method, code, recordedAt: Date.now() });
  }

  function onStaff(userId: number, method: "qr" | "manual", code?: string) {
    const sup = pack?.supervisors?.find((s) => s.userId === userId);
    if (!pack?.supervisors) return setBanner({ message: "ده QR مشرف، والأدمن بس اللي يسجّله", tone: "danger" });
    if (!sup) return setBanner({ message: "المشرف ده مش على الرحلة", tone: "danger" });
    const already = sup.present || records.some((r) => r.payload.kind === "staff" && r.payload.userId === userId && standing(r));
    if (already) return setBanner({ name: sup.name, message: "مكرر: المشرف متسجل قبل كده", tone: "neutral" });
    void enqueue(sup.name, { kind: "staff", clientUuid: crypto.randomUUID(), userId, method, code, recordedAt: Date.now() });
  }

  const lastText = useRef<{ text: string; at: number } | null>(null);
  const onDecoded = (text: string) => {
    const now = Date.now();
    if (lastText.current && lastText.current.text === text && now - lastText.current.at < SAME_SCAN_MS) return;
    lastText.current = { text, at: now };
    const qr = parseQrPayload(text);
    if (!qr) return setBanner({ message: "ده مش QR حضور", tone: "danger" });
    if (qr.kind === "B") onStudent(qr.id, "qr", qr.code);
    else onStaff(qr.id, "qr", qr.code);
  };

  async function download() {
    if (await refreshPack()) {
      warmOffline([`/dashboard/trips/${tripId}/scan`]);
      setBanner({ message: "الرحلة اتحملت وتقدر تشتغل من غير نت", tone: "success" });
    } else {
      setBanner({ message: "مفيش نت، جرّب تاني", tone: "danger" });
    }
  }

  const unsent = records.filter((r) => r.state === "queued").length;

  if (!pack) {
    return (
      <div className="mx-auto max-w-md space-y-3 text-center">
        <p className="text-sm text-muted">{loading ? "بيحمّل الرحلة..." : "الرحلة مش متحمّلة على الموبايل ده. افتح الصفحة والنت شغال مرة."}</p>
        {!loading && <Button onClick={download}>تحميل الرحلة للعمل أوفلاين</Button>}
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-xl space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-lg font-bold">{pack.trip.title}</h1>
          <p className="text-xs text-muted">
            {savedAt ? `آخر تحميل ${new Date(savedAt).toLocaleTimeString("ar-EG", { hour: "numeric", minute: "2-digit" })}` : ""}
          </p>
        </div>
        <div className="flex items-center gap-2 text-sm" role="status">
          <span className={`inline-block size-2.5 rounded-full ${online ? "bg-success" : "bg-danger"}`} />
          {online ? "أونلاين" : "أوفلاين"}
          {unsent > 0 && <Badge tone="warning">{unsent} لسه مترفعش</Badge>}
        </div>
      </div>

      {signedOut && (
        <div className="rounded-lg border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger">
          الجلسة انتهت. <a href="/login" className="underline">سجّل دخول</a> تاني عشان التسجيلات تترفع (محفوظة على الموبايل).
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        {openCps.length === 0 ? (
          <span className="text-sm text-danger">مفيش تجمع مفتوح دلوقتي</span>
        ) : (
          <select
            aria-label="التجمع"
            value={cp?.id ?? ""}
            onChange={(e) => setCpId(Number(e.target.value))}
            className="rounded-lg border border-border bg-surface px-3 py-2 text-sm"
          >
            {openCps.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        )}
        <Button variant="secondary" className="px-3 py-2 text-xs" onClick={download} disabled={loading}>
          تحميل الرحلة للعمل أوفلاين
        </Button>
        {unsent > 0 && online && (
          <Button variant="secondary" className="px-3 py-2 text-xs" onClick={() => void sync()}>
            رفع دلوقتي
          </Button>
        )}
      </div>

      {banner && (
        <div className={`rounded-xl border px-4 py-3 ${bannerCls[banner.tone]}`} role="alert">
          {banner.name && <div className="text-lg font-bold">{banner.name}</div>}
          <div className="text-sm font-medium">{banner.message}</div>
        </div>
      )}

      <div className="flex gap-1 rounded-lg border border-border bg-surface p-1 text-sm" role="tablist">
        {(
          [
            ["scan", "Scan"],
            ["list", "الكشف"],
            ["log", `التسجيلات (${records.length})`],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            role="tab"
            aria-selected={tab === key}
            onClick={() => setTab(key)}
            className={`flex-1 rounded-md px-3 py-1.5 font-semibold ${tab === key ? "bg-primary text-primary-foreground" : "text-muted"}`}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === "scan" && <Camera onDecoded={onDecoded} />}
      {tab === "list" && <RosterList pack={pack} cp={cp} isRecorded={isRecorded} onMark={(id) => onStudent(id, "manual")} onStaff={(id) => onStaff(id, "manual")} />}
      {tab === "log" && <RecordLog records={records} />}
    </div>
  );
}

function Camera({ onDecoded }: { onDecoded: (text: string) => void }) {
  const video = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState<string | null>(null);
  const handler = useRef(onDecoded);
  useEffect(() => {
    handler.current = onDecoded;
  });

  useEffect(() => {
    let stream: MediaStream | null = null;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let stopped = false;
    const canvas = document.createElement("canvas");
    const ctx2d = canvas.getContext("2d", { willReadFrequently: true });

    const tick = () => {
      const v = video.current;
      if (stopped || !v || !ctx2d) return;
      if (v.readyState >= 2 && v.videoWidth) {
        // Downscale for speed; QR codes on a phone screen stay readable.
        const scale = Math.min(1, 640 / v.videoWidth);
        canvas.width = Math.round(v.videoWidth * scale);
        canvas.height = Math.round(v.videoHeight * scale);
        ctx2d.drawImage(v, 0, 0, canvas.width, canvas.height);
        const img = ctx2d.getImageData(0, 0, canvas.width, canvas.height);
        const found = jsQR(img.data, img.width, img.height, { inversionAttempts: "dontInvert" });
        if (found?.data) handler.current(found.data);
      }
      timer = setTimeout(tick, 200);
    };

    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" }, audio: false });
        if (stopped) return stream.getTracks().forEach((t) => t.stop());
        if (video.current) {
          video.current.srcObject = stream;
          await video.current.play().catch(() => {});
        }
        tick();
      } catch {
        setError("مقدرتش أفتح الكاميرا. اسمح بالكاميرا من إعدادات المتصفح، أو سجّل من «الكشف».");
      }
    })();

    return () => {
      stopped = true;
      clearTimeout(timer);
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  return error ? (
    <p className="rounded-lg border border-border bg-surface p-4 text-sm text-danger">{error}</p>
  ) : (
    <div className="overflow-hidden rounded-2xl border border-border bg-black">
      <video ref={video} muted playsInline className="aspect-square w-full object-cover" />
    </div>
  );
}

function RosterList({
  pack,
  cp,
  isRecorded,
  onMark,
  onStaff,
}: {
  pack: ScanPack;
  cp: ScanPack["checkpoints"][number] | null;
  isRecorded: (bookingId: number) => boolean;
  onMark: (bookingId: number) => void;
  onStaff: (userId: number) => void;
}) {
  const [q, setQ] = useState("");
  const shown = pack.students.filter((s) => !(cp && cp.sortOrder > 1 && s.out) && (!q || s.name.includes(q.trim()) || s.phone.includes(q.trim())));
  const remaining = shown.filter((s) => !isRecorded(s.bookingId)).length;
  return (
    <div className="space-y-3">
      <Input type="search" placeholder="دوّر بالاسم أو الهاتف" value={q} onChange={(e) => setQ(e.target.value)} />
      <p className="text-xs text-muted">
        {cp ? `${cp.name}: لسه ${remaining} من ${shown.length}` : "مفيش تجمع مفتوح"}
      </p>
      <ul className="divide-y divide-border rounded-2xl border border-border bg-surface">
        {shown.map((s) => {
          const done = isRecorded(s.bookingId);
          return (
            <li key={s.bookingId} className="flex items-center justify-between gap-3 px-4 py-2.5">
              <div className="min-w-0">
                <div className="font-medium">{s.name}</div>
                <div className="flex flex-wrap gap-x-3 text-xs text-muted">
                  <span>{s.faculty}</span>
                  {s.bus && <span>{s.bus}</span>}
                  <a href={`tel:${s.phone}`} className="text-primary" dir="ltr">
                    {s.phone}
                  </a>
                </div>
              </div>
              {done ? (
                <Badge tone="success">متسجل</Badge>
              ) : (
                pack.canManual && cp && (
                  <Button className="px-3 py-1.5 text-xs" onClick={() => onMark(s.bookingId)}>
                    تحضير
                  </Button>
                )
              )}
            </li>
          );
        })}
      </ul>
      {pack.supervisors && pack.supervisors.length > 0 && (
        <>
          <h2 className="pt-2 font-semibold">المشرفين</h2>
          <ul className="divide-y divide-border rounded-2xl border border-border bg-surface">
            {pack.supervisors.map((s) => (
              <li key={s.userId} className="flex items-center justify-between gap-3 px-4 py-2.5">
                <span className="font-medium">{s.name}</span>
                {s.present ? (
                  <Badge tone="success">متسجل</Badge>
                ) : (
                  <Button variant="secondary" className="px-3 py-1.5 text-xs" onClick={() => onStaff(s.userId)}>
                    تحضير
                  </Button>
                )}
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

function RecordLog({ records }: { records: QueuedRecord[] }) {
  if (!records.length) return <p className="text-sm text-muted">مفيش تسجيلات على الموبايل ده.</p>;
  return (
    <ul className="divide-y divide-border rounded-2xl border border-border bg-surface">
      {[...records].reverse().map((r) => (
        <li key={r.clientUuid} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm">
          <div>
            <div className="font-medium">{r.name}</div>
            <div className="text-xs text-muted">
              {new Date(r.payload.recordedAt).toLocaleTimeString("ar-EG", { hour: "numeric", minute: "2-digit" })} · {r.payload.method === "qr" ? "QR" : "يدوي"}
            </div>
          </div>
          <Badge tone={RESULT_TONES[r.state]}>{r.message}</Badge>
        </li>
      ))}
    </ul>
  );
}
