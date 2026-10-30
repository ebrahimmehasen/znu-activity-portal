"use client";

import QRCode from "qrcode";
import { useEffect, useState } from "react";
import { useT } from "@/i18n/client";
import { QR_STEP_SECONDS, counterAt, qrPayload, secondsLeft, totp, type QrKind } from "@/lib/qr/totp";

/** A QR that changes every 30 seconds, generated on the device (works offline). */
export function TotpQr({ secret, kind, id }: { secret: string; kind: QrKind; id: number }) {
  const t = useT();
  const [svg, setSvg] = useState<string | null>(null);
  const [left, setLeft] = useState(QR_STEP_SECONDS);
  const [error, setError] = useState(false);

  useEffect(() => {
    let counter = -1;
    let alive = true;
    async function tick() {
      const now = Date.now();
      setLeft(secondsLeft(now));
      const c = counterAt(now);
      if (c === counter) return;
      counter = c;
      try {
        const code = await totp(secret, c);
        const out = await QRCode.toString(qrPayload(kind, id, code), { type: "svg", margin: 1, errorCorrectionLevel: "M" });
        if (alive) setSvg(out);
      } catch {
        if (alive) setError(true);
      }
    }
    tick();
    const timer = setInterval(tick, 1000);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [secret, kind, id]);

  if (error) return <p className="text-sm text-danger">{t("هذا المتصفح لا يدعم إنشاء رمز QR. افتح البوابة من Chrome أو Safari.")}</p>;

  return (
    <div className="mx-auto w-full max-w-72 space-y-3">
      <div
        role="img"
        aria-label={t("رمز الحضور")}
        className="aspect-square w-full rounded-xl bg-white p-2 [&>svg]:h-full [&>svg]:w-full"
        // Generated locally by the qrcode library from our own payload.
        dangerouslySetInnerHTML={svg ? { __html: svg } : undefined}
      />
      <div className="space-y-1">
        <div className="h-1.5 overflow-hidden rounded-full bg-background">
          <div className="h-full bg-primary transition-[width] duration-1000 ease-linear" style={{ width: `${(left / QR_STEP_SECONDS) * 100}%` }} />
        </div>
        <p className="text-center text-sm text-muted">
          {t("يتغيّر الرمز كل {n} ثانية · متبقٍّ", { n: QR_STEP_SECONDS })} <span className="ltr-nums font-semibold">{left}</span> {t("ثانية")}
        </p>
      </div>
    </div>
  );
}
