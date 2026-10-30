"use client";

import { useT } from "@/i18n/client";

/** Translates a text (often a server message) where a hook can't be called, e.g. in shared UI. */
export function Tr({ text }: { text: string }) {
  return useT()(text);
}
