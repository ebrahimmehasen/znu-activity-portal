import type { Metadata } from "next";
import { getT } from "@/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getT())("لا يوجد اتصال") };
}

/** Served by the service worker when a page isn't available offline. */
export default async function OfflinePage() {
  const t = await getT();
  return (
    <main className="flex flex-1 items-center justify-center p-4">
      <div className="w-full max-w-sm space-y-4 rounded-2xl border border-border bg-surface p-6 text-center shadow-sm">
        <h1 className="text-xl font-bold">{t("لا يوجد اتصال بالإنترنت")}</h1>
        <p className="text-sm text-muted">{t("هذه الصفحة تحتاج إلى اتصال بالإنترنت. يعمل رمز الحضور دون إنترنت إذا فتحته من قبل وأنت متصل.")}</p>
        <div className="flex flex-col gap-2">
          <a href="/portal/qr" className="rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground">
            {t("رمز الطالب")}
          </a>
          <a href="/dashboard/my-qr" className="rounded-lg border border-border px-4 py-2.5 text-sm font-semibold">
            {t("رمز المشرف")}
          </a>
        </div>
      </div>
    </main>
  );
}
