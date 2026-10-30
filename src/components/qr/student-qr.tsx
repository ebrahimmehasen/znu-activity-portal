"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { cairoToday, formatDate } from "@/lib/dates";
import type { OfflineQr } from "@/lib/students/auth";
import { STUDENT_QR_KEY, clearStored, fetchQrData, readStored, warmOffline, writeStored, type Stored } from "./offline-store";
import { TotpQr } from "./totp-qr";

export type StudentQrData = { name: string; bookings: OfflineQr[] };

const noop = () => () => {};

/** Loads the saved copy, refreshes it when online, and reports what's ready offline. */
function useStudentQr() {
  const mounted = useSyncExternalStore(noop, () => true, () => false);
  const [stored, setStored] = useState<Stored<StudentQrData> | null>(null);
  const [state, setState] = useState<"syncing" | "online" | "offline" | "signed-out">("syncing");

  useEffect(() => {
    let alive = true;
    // Saved copy first so the QR shows instantly, even offline.
    queueMicrotask(() => alive && setStored(readStored<StudentQrData>(STUDENT_QR_KEY)));
    fetchQrData<StudentQrData>("/portal/qr/data").then((fresh) => {
      if (!alive) return;
      if (fresh === "signed-out") {
        clearStored(STUDENT_QR_KEY);
        setStored(null);
        setState("signed-out");
      } else if (fresh) {
        writeStored(STUDENT_QR_KEY, fresh);
        setStored(readStored<StudentQrData>(STUDENT_QR_KEY));
        setState("online");
        if (fresh.bookings.length) warmOffline(["/portal/qr"]);
      } else {
        setState("offline");
      }
    });
    return () => {
      alive = false;
    };
  }, []);

  return { mounted, stored, state };
}

/** Banner on the portal home: is the QR ready for offline use? */
export function QrReadiness() {
  const { stored, state } = useStudentQr();
  const count = stored?.data.bookings.length ?? 0;

  return (
    <div className="rounded-xl border border-primary/20 bg-primary/5 p-4 text-sm">
      <p className="font-semibold text-primary">افتح البورتل مرة والنت شغال قبل يوم الرحلة</p>
      <p className="mt-1 text-muted">
        {state === "syncing"
          ? "بنجهّز الـ QR على موبايلك…"
          : count > 0
            ? `الـ QR جاهز يشتغل من غير نت لـ ${count === 1 ? "رحلة واحدة" : `${count} رحلات`} ✓`
            : state === "offline"
              ? "مفيش نت دلوقتي، ومفيش QR محفوظ على الموبايل ده."
              : "الـ QR بيتجهز لما حجزك يتأكد."}
      </p>
      {count > 0 && (
        // A full page load, so it also opens from the offline cache.
        <a href="/portal/qr" className="mt-3 inline-flex rounded-lg bg-primary px-4 py-2 font-semibold text-primary-foreground">
          QR الحضور
        </a>
      )}
    </div>
  );
}

/** The QR page: shows the code for today's / the running trip, from the saved copy. */
export function StudentQrScreen() {
  const { mounted, stored, state } = useStudentQr();
  if (!mounted || (state === "syncing" && !stored)) return <p className="py-10 text-center text-muted">جاري التحميل…</p>;
  if (state === "signed-out") {
    return (
      <p className="py-10 text-center">
        انتهت الجلسة.{" "}
        <a href="/portal/login" className="text-primary">
          ادخل تاني
        </a>
      </p>
    );
  }

  const bookings = stored?.data.bookings ?? [];
  const today = cairoToday();
  // Offline the phone can't see the trip start, so its date counts too; the server checks anyway.
  const active = bookings.filter((b) => b.tripStatus === "ongoing" || b.date === today);

  return (
    <div className="space-y-4">
      {state === "offline" && (
        <p className="rounded-lg bg-warning/10 px-3 py-2 text-center text-sm text-warning">
          انت أوفلاين · آخر تحديث {new Date(stored?.savedAt ?? 0).toLocaleString("ar-EG")}
        </p>
      )}

      {active.length === 0 ? (
        <div className="space-y-3 py-6 text-center">
          <p className="font-semibold">الـ QR بيظهر يوم الرحلة لما تبدأ.</p>
          {bookings.length > 0 ? (
            <ul className="space-y-1 text-sm text-muted">
              {bookings.map((b) => (
                <li key={b.bookingId}>
                  {b.title} — {formatDate(b.date)} · جاهز أوفلاين ✓
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted">مفيش حجز متأكد محفوظ على الموبايل ده.</p>
          )}
        </div>
      ) : (
        active.map((b) => (
          <section key={b.bookingId} className="space-y-3 text-center">
            <div>
              <h2 className="text-lg font-bold">{b.title}</h2>
              <p className="text-sm text-muted">
                {stored?.data.name}
                {b.busName && ` · ${b.busName}`}
              </p>
            </div>
            <TotpQr secret={b.secret} kind="B" id={b.bookingId} />
          </section>
        ))
      )}
    </div>
  );
}
