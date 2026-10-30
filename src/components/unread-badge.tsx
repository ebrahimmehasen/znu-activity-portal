"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useT } from "@/i18n/client";

const POLL_MS = 20_000;
/** Fired by pages after marking announcements read, so the badge updates at once. */
export const ANNOUNCEMENTS_READ_EVENT = "znu:announcements-read";

/**
 * The unread announcements count, polled every 20 s while the tab is visible (plan §5.8).
 * When new ones arrive and the user is on a page under `refreshUnder`, that page re-renders
 * so they show up without a reload. Network errors (offline) keep the last count.
 */
export function UnreadBadge({ endpoint, initial, refreshUnder }: { endpoint: string; initial: number; refreshUnder?: string }) {
  const t = useT();
  const [count, setCount] = useState(initial);
  const last = useRef(initial);
  const router = useRouter();
  const pathname = usePathname();
  const pathRef = useRef(pathname);

  useEffect(() => {
    pathRef.current = pathname;
  }, [pathname]);

  useEffect(() => {
    let stopped = false;
    async function poll() {
      if (document.visibilityState !== "visible") return;
      try {
        const res = await fetch(endpoint, { cache: "no-store" });
        if (!res.ok) return;
        const { count: n } = (await res.json()) as { count: number };
        if (stopped) return;
        if (n > last.current && refreshUnder && pathRef.current.startsWith(refreshUnder)) router.refresh();
        last.current = n;
        setCount(n);
      } catch {
        // Offline: keep the last count.
      }
    }
    const timer = setInterval(poll, POLL_MS);
    document.addEventListener("visibilitychange", poll);
    window.addEventListener(ANNOUNCEMENTS_READ_EVENT, poll);
    return () => {
      stopped = true;
      clearInterval(timer);
      document.removeEventListener("visibilitychange", poll);
      window.removeEventListener(ANNOUNCEMENTS_READ_EVENT, poll);
    };
  }, [endpoint, refreshUnder, router]);

  // A re-rendered layout passes a fresh count down.
  useEffect(() => {
    last.current = initial;
    queueMicrotask(() => setCount(initial));
  }, [initial]);

  if (count <= 0) return null;
  return (
    <span className="ms-1.5 inline-flex min-w-5 items-center justify-center rounded-full bg-danger px-1.5 text-xs font-bold text-surface" aria-label={t("{n} غير مقروء", { n: count })}>
      {count > 99 ? "99+" : count}
    </span>
  );
}
