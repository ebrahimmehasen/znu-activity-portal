"use client";

import { Button } from "@/components/ui";
import { useT } from "@/i18n/client";
import { clearScanData, unsentCount } from "@/components/attendance/scan-store";
import { clearOfflinePages, clearStored } from "@/components/qr/offline-store";

/** Logout that also wipes the offline QR copy and any scanner data from this device. */
export function LogoutButton({ action, storageKey }: { action: () => Promise<void>; storageKey: string }) {
  const t = useT();
  return (
    <form
      action={action}
      onSubmit={(e) => {
        const unsent = unsentCount();
        if (unsent && !window.confirm(t("يوجد {n} تسجيل حضور لم يُرفع بعد، وستضيع إذا خرجت. هل تريد الخروج؟", { n: unsent }))) {
          e.preventDefault();
          return;
        }
        clearStored(storageKey);
        clearScanData();
        void clearOfflinePages();
      }}
    >
      <Button variant="ghost" className="px-2 py-1.5">
        {t("خروج")}
      </Button>
    </form>
  );
}
