import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { StaffQrScreen } from "@/components/qr/staff-qr";
import { PageHeader } from "@/components/ui";
import { requireUser } from "@/lib/auth/session";

export const metadata: Metadata = { title: "QR الحضور" };

/** Supervisors only; the QR itself comes from the copy saved on the phone (offline-capable). */
export default async function MyQrPage() {
  const user = await requireUser();
  if (user.role !== "supervisor") notFound();
  return (
    <div className="mx-auto max-w-md">
      <PageHeader title="QR الحضور بتاعي" />
      <StaffQrScreen />
    </div>
  );
}
