import type { Metadata } from "next";
import { StudentQrScreen } from "@/components/qr/student-qr";
import { requireStudent } from "@/lib/students/session";

export const metadata: Metadata = { title: "QR الحضور" };

/**
 * Renders no personal data on the server: the service worker caches this page for
 * offline use, and the QR comes from the copy saved on the phone.
 */
export default async function StudentQrPage() {
  await requireStudent();
  return (
    <main className="mx-auto w-full max-w-md flex-1 px-4 py-6">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-xl font-bold">QR الحضور</h1>
        <a href="/portal" className="text-sm text-primary">
          رحلاتي
        </a>
      </div>
      <StudentQrScreen />
    </main>
  );
}
