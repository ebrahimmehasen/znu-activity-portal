import Link from "next/link";

export default function Home() {
  return (
    <main className="flex flex-1 items-center justify-center p-4">
      <div className="w-full max-w-md rounded-2xl border border-border bg-surface p-8 text-center shadow-sm">
        <h1 className="text-2xl font-bold text-primary">بوابة الأنشطة</h1>
        <p className="mt-2 text-muted">جامعة الزقازيق الأهلية</p>
        <Link
          href="/login"
          className="mt-8 inline-flex w-full items-center justify-center rounded-lg bg-primary px-4 py-3 font-semibold text-primary-foreground hover:opacity-90"
        >
          دخول الإدارة والمشرفين
        </Link>
      </div>
    </main>
  );
}
