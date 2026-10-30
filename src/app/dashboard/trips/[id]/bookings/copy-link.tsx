"use client";

import { useState, useSyncExternalStore } from "react";
import { Button } from "@/components/ui";
import { useT } from "@/i18n/client";

const noop = () => () => {};

/** Shows the full public link (origin is only known in the browser) with a copy button. */
export function CopyLink({ path }: { path: string }) {
  const t = useT();
  const origin = useSyncExternalStore(noop, () => window.location.origin, () => "");
  const [copied, setCopied] = useState(false);
  const url = `${origin}${path}`;

  return (
    <div className="flex gap-2">
      <input
        readOnly
        value={url}
        dir="ltr"
        aria-label={t("رابط الحجز")}
        onFocus={(e) => e.currentTarget.select()}
        className="min-w-0 flex-1 rounded-lg border border-border bg-background px-3 py-2 text-sm text-muted"
      />
      <Button
        type="button"
        variant="secondary"
        onClick={async () => {
          await navigator.clipboard.writeText(url);
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        }}
      >
        {copied ? `${t("تم النسخ")} ✓` : t("نسخ الرابط")}
      </Button>
    </div>
  );
}
