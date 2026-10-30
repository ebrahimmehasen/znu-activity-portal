import type { Metadata } from "next";

export const metadata: Metadata = { title: "مفيش نت" };

/** Served by the service worker when a page isn't available offline. */
export default function OfflinePage() {
  return (
    <main className="flex flex-1 items-center justify-center p-4">
      <div className="w-full max-w-sm space-y-4 rounded-2xl border border-border bg-surface p-6 text-center shadow-sm">
        <h1 className="text-xl font-bold">مفيش اتصال بالنت</h1>
        <p className="text-sm text-muted">الصفحة دي محتاجة نت. الـ QR بيشتغل من غير نت لو فتحته قبل كده والنت شغال.</p>
        <div className="flex flex-col gap-2">
          <a href="/portal/qr" className="rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground">
            QR الطالب
          </a>
          <a href="/dashboard/my-qr" className="rounded-lg border border-border px-4 py-2.5 text-sm font-semibold">
            QR المشرف
          </a>
        </div>
      </div>
    </main>
  );
}
