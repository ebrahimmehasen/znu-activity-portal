"use client";

import { Button } from "@/components/ui";

/** The browser's print dialog renders Arabic correctly; "Save as PDF" there makes the PDF. */
export function PrintButton() {
  return (
    <Button variant="secondary" onClick={() => window.print()}>
      طباعة / PDF
    </Button>
  );
}
