import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { getCurrentStudent } from "@/lib/students/session";

/** The installed app opens here; a signed-in student or staff member goes straight in. */
export default async function Home() {
  if (await getCurrentStudent()) redirect("/portal");
  if (await getCurrentUser()) redirect("/dashboard");

  return (
    <main className="flex flex-1 items-center justify-center p-4">
      <div className="w-full max-w-md rounded-2xl border border-border bg-surface p-8 text-center shadow-sm">
        <h1 className="text-2xl font-bold text-primary">بوابة الأنشطة</h1>
        <p className="mt-2 text-muted">جامعة الزقازيق الأهلية</p>
        <div className="mt-8 space-y-3">
          <Link
            href="/portal/login"
            className="inline-flex w-full items-center justify-center rounded-lg bg-primary px-4 py-3 font-semibold text-primary-foreground hover:opacity-90"
          >
            دخول الطلبة
          </Link>
          <Link
            href="/login"
            className="inline-flex w-full items-center justify-center rounded-lg border border-border px-4 py-3 font-semibold hover:bg-background"
          >
            دخول الإدارة والمشرفين
          </Link>
        </div>
      </div>
    </main>
  );
}
