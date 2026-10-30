import type { Metadata } from "next";
import { getT } from "@/i18n/server";
import { StudentQrScreen } from "@/components/qr/student-qr";
import { requireStudent } from "@/lib/students/session";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getT())("رمز الحضور") };
}

/**
 * Renders no personal data on the server: the service worker caches this page for
 * offline use, and the QR comes from the copy saved on the phone.
 */
export default async function StudentQrPage() {
  await requireStudent();
  const t = await getT();
  return (
    <main className="mx-auto w-full max-w-md flex-1 px-4 py-6">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-xl font-bold">{t("رمز الحضور")}</h1>
        <a href="/portal" className="text-sm text-primary">
          {t("رحلاتي")}
        </a>
      </div>
      <StudentQrScreen />
    </main>
  );
}
