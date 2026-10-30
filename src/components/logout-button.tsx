"use client";

import { Button } from "@/components/ui";
import { clearOfflinePages, clearStored } from "@/components/qr/offline-store";

/** Logout that also wipes the offline QR copy from this device. */
export function LogoutButton({ action, storageKey }: { action: () => Promise<void>; storageKey: string }) {
  return (
    <form
      action={action}
      onSubmit={() => {
        clearStored(storageKey);
        void clearOfflinePages();
      }}
    >
      <Button variant="ghost" className="px-2 py-1.5">
        خروج
      </Button>
    </form>
  );
}
