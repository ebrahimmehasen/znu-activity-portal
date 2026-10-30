"use client";

import { Button } from "@/components/ui";
import { useT } from "@/i18n/client";

/** The browser's print dialog renders Arabic correctly; "Save as PDF" there makes the PDF. */
export function PrintButton() {
  const t = useT();
  return (
    <Button variant="secondary" onClick={() => window.print()}>
      {t("طباعة / PDF")}
    </Button>
  );
}
