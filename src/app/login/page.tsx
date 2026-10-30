import type { Metadata } from "next";
import { getT } from "@/i18n/server";
import { redirect } from "next/navigation";
import { Preferences } from "@/components/preferences";
import { Card } from "@/components/ui";
import { getTheme } from "@/i18n/server";
import { getCurrentUser } from "@/lib/auth/session";
import { LoginForm } from "./login-form";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getT())("تسجيل الدخول") };
}

export default async function LoginPage() {
  if (await getCurrentUser()) redirect("/dashboard");
  const [t, theme] = await Promise.all([getT(), getTheme()]);

  return (
    <main className="relative flex flex-1 items-center justify-center p-4">
      <div className="absolute end-4 top-4">
        <Preferences theme={theme} />
      </div>
      <Card className="w-full max-w-sm p-6 sm:p-8">
        <h1 className="text-center text-xl font-bold text-primary">{t("بوابة الأنشطة")}</h1>
        <p className="mb-6 mt-1 text-center text-sm text-muted">{t("دخول الإدارة والمشرفين")}</p>
        <LoginForm />
      </Card>
    </main>
  );
}
