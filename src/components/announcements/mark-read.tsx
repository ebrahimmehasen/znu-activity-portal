"use client";

import { useEffect, useRef } from "react";
import { ANNOUNCEMENTS_READ_EVENT } from "@/components/unread-badge";

/**
 * Marks the shown announcements read once the page is on screen. Done from the client,
 * not during render, so prefetching a page doesn't count as reading it. The page isn't
 * re-rendered, so "جديد" stays until the next visit; the header badge re-polls instead.
 */
export function MarkRead({ ids, action }: { ids: number[]; action: (ids: number[]) => Promise<void> }) {
  const sent = useRef("");
  const key = ids.join(",");
  useEffect(() => {
    if (!key || sent.current === key) return;
    sent.current = key;
    action(key.split(",").map(Number))
      .then(() => window.dispatchEvent(new Event(ANNOUNCEMENTS_READ_EVENT)))
      .catch(() => {
        sent.current = "";
      });
  }, [key, action]);
  return null;
}
