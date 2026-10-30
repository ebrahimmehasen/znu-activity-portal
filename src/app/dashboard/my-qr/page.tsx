import type { Metadata } from "next";
import { getT } from "@/i18n/server";
import { notFound } from "next/navigation";
import { StaffQrScreen } from "@/components/qr/staff-qr";
import { PageHeader } from "@/components/ui";
import { requireUser } from "@/lib/auth/session";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getT())("رمز الحضور") };
}

/** Supervisors only; the QR itself comes from the copy saved on the phone (offline-capable). */
export default async function MyQrPage() {
  const user = await requireUser();
  if (user.role !== "supervisor") notFound();
  const t = await getT();
  return (
    <div className="mx-auto max-w-md">
      <PageHeader title={t("رمز حضوري")} />
      <StaffQrScreen />
    </div>
  );
}
