"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { STAFF_QR_KEY, clearStored, fetchQrData, readStored, warmOffline, writeStored, type Stored } from "./offline-store";
import { useT } from "@/i18n/client";
import { TotpQr } from "./totp-qr";

type StaffQrData = { userId: number; name: string; secret: string };

const noop = () => () => {};

/** The supervisor's own attendance QR (plan §5.5), same offline scheme as students. */
export function StaffQrScreen() {
  const mounted = useSyncExternalStore(noop, () => true, () => false);
  const t = useT();
  const [stored, setStored] = useState<Stored<StaffQrData> | null>(null);
  const [state, setState] = useState<"syncing" | "online" | "offline" | "signed-out">("syncing");

  useEffect(() => {
    let alive = true;
    queueMicrotask(() => alive && setStored(readStored<StaffQrData>(STAFF_QR_KEY)));
    fetchQrData<StaffQrData>("/dashboard/my-qr/data").then((fresh) => {
      if (!alive) return;
      if (fresh === "signed-out") {
        clearStored(STAFF_QR_KEY);
        setStored(null);
        setState("signed-out");
      } else if (fresh) {
        writeStored(STAFF_QR_KEY, fresh);
        setStored(readStored<StaffQrData>(STAFF_QR_KEY));
        setState("online");
        warmOffline(["/dashboard/my-qr"]);
      } else {
        setState("offline");
      }
    });
    return () => {
      alive = false;
    };
  }, []);

  if (!mounted || (state === "syncing" && !stored)) return <p className="py-10 text-center text-muted">{t("جارٍ التحميل…")}</p>;
  if (state === "signed-out" || !stored) {
    return (
      <p className="py-10 text-center">
        {state === "offline" ? t("لا يوجد اتصال، والرمز غير محفوظ على هذا الهاتف. افتح هذه الصفحة مرة وأنت متصل بالإنترنت.") : `${t("انتهت الجلسة.")} `}
        {state !== "offline" && (
          <a href="/login" className="text-primary">
            {t("سجِّل الدخول مجددًا")}
          </a>
        )}
      </p>
    );
  }

  return (
    <div className="space-y-4 text-center">
      {state === "offline" && (
        <p className="rounded-lg bg-warning/10 px-3 py-2 text-sm text-warning">
          {t("أنت غير متصل · يعمل الرمز من النسخة المحفوظة على الهاتف")}
        </p>
      )}
      <p className="font-semibold">{stored.data.name}</p>
      <TotpQr secret={stored.data.secret} kind="S" id={stored.data.userId} />
      <p className="text-sm text-muted">{t("يمسح المسؤول هذا الرمز لتسجيل حضورك. افتح هذه الصفحة مرة وأنت متصل بالإنترنت قبل الرحلة.")}</p>
    </div>
  );
}
