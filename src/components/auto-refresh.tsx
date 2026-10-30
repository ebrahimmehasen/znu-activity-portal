"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

/** Re-renders the current page every `seconds` while the tab is visible (live counts). */
export function AutoRefresh({ seconds }: { seconds: number }) {
  const router = useRouter();
  useEffect(() => {
    const timer = setInterval(() => {
      if (document.visibilityState === "visible" && navigator.onLine) router.refresh();
    }, seconds * 1000);
    return () => clearInterval(timer);
  }, [router, seconds]);
  return null;
}
