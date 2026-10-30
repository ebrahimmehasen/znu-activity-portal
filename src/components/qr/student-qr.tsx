"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { cairoToday, formatDate } from "@/lib/dates";
import type { OfflineQr } from "@/lib/students/auth";
import { STUDENT_QR_KEY, clearStored, fetchQrData, readStored, warmOffline, writeStored, type Stored } from "./offline-store";
import { useLocale, useT } from "@/i18n/client";
import { intlLocale } from "@/i18n/config";
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
  const t = useT();
  const { stored, state } = useStudentQr();
  const count = stored?.data.bookings.length ?? 0;

  return (
    <div className="rounded-xl border border-primary/20 bg-primary/5 p-4 text-sm">
      <p className="font-semibold text-primary">{t("افتح البوابة مرة وأنت متصل بالإنترنت قبل يوم الرحلة")}</p>
      <p className="mt-1 text-muted">
        {state === "syncing"
          ? t("جارٍ تجهيز الرمز على هاتفك…")
          : count > 0
            ? `${count === 1 ? t("الرمز جاهز للعمل دون إنترنت لرحلة واحدة") : t("الرمز جاهز للعمل دون إنترنت لـ {n} رحلات", { n: count })} ✓`
            : state === "offline"
              ? t("لا يوجد اتصال الآن، ولا يوجد رمز محفوظ على هذا الهاتف.")
              : t("يُجهَّز الرمز عند تأكيد حجزك.")}
      </p>
      {count > 0 && (
        // A full page load, so it also opens from the offline cache.
        <a href="/portal/qr" className="mt-3 inline-flex rounded-lg bg-primary px-4 py-2 font-semibold text-primary-foreground">
          {t("رمز الحضور")}
        </a>
      )}
    </div>
  );
}

/** The QR page: shows the code for today's / the running trip, from the saved copy. */
export function StudentQrScreen() {
  const t = useT();
  const locale = useLocale();
  const { mounted, stored, state } = useStudentQr();
  if (!mounted || (state === "syncing" && !stored)) return <p className="py-10 text-center text-muted">{t("جارٍ التحميل…")}</p>;
  if (state === "signed-out") {
    return (
      <p className="py-10 text-center">
        {t("انتهت الجلسة.")}{" "}
        <a href="/portal/login" className="text-primary">
          {t("سجِّل الدخول مجددًا")}
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
          {t("أنت غير متصل · آخر تحديث")} {new Date(stored?.savedAt ?? 0).toLocaleString(intlLocale(locale))}
        </p>
      )}

      {active.length === 0 ? (
        <div className="space-y-3 py-6 text-center">
          <p className="font-semibold">{t("يظهر الرمز يوم الرحلة عند بدئها.")}</p>
          {bookings.length > 0 ? (
            <ul className="space-y-1 text-sm text-muted">
              {bookings.map((b) => (
                <li key={b.bookingId}>
                  {b.title} — {formatDate(b.date, locale)} · {t("جاهز دون إنترنت")} ✓
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted">{t("لا يوجد حجز مؤكد محفوظ على هذا الهاتف.")}</p>
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
