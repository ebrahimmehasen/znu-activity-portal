import type { Metadata } from "next";
import { getT } from "@/i18n/server";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Logo } from "@/components/logo";
import { Preferences } from "@/components/preferences";
import { Card } from "@/components/ui";
import { getTheme } from "@/i18n/server";
import { getCurrentStudent } from "@/lib/students/session";
import { StudentLoginForm } from "./login-form";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getT())("دخول الطلاب") };
}

export default async function StudentLoginPage() {
  if (await getCurrentStudent()) redirect("/portal");
  const [t, theme] = await Promise.all([getT(), getTheme()]);

  return (
    <main className="relative flex flex-1 items-center justify-center p-4">
      <div className="absolute end-4 top-4">
        <Preferences theme={theme} />
      </div>
      <Card className="w-full max-w-sm p-6 sm:p-8">
        <Logo size={88} className="mx-auto mb-3" />
        <h1 className="text-center text-xl font-bold text-primary">{t("بوابة الطلاب")}</h1>
        <p className="mb-6 mt-1 text-center text-sm text-muted">{t("ادخل برقم الهاتف والرقم القومي اللذين حجزت بهما")}</p>
        <StudentLoginForm />
        <p className="mt-6 text-center text-xs text-muted">
          <Link href="/login" className="hover:text-primary">
            {t("دخول الإدارة والمشرفين")}
          </Link>
        </p>
      </Card>
    </main>
  );
}
