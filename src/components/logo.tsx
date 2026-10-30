"use client";

import Image from "next/image";
import { useT } from "@/i18n/client";

/** The university logo (round, transparent corners). Served as is, so it also works offline. */
export function Logo({ size, className = "" }: { size: number; className?: string }) {
  const t = useT();
  return (
    <Image src="/logo.webp" width={size} height={size} alt={t("شعار جامعة الزقازيق الأهلية")} unoptimized priority className={`shrink-0 rounded-full ${className}`} />
  );
}
