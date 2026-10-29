import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Card } from "@/components/ui";
import { getCurrentUser } from "@/lib/auth/session";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "تسجيل الدخول" };

export default async function LoginPage() {
  if (await getCurrentUser()) redirect("/dashboard");

  return (
    <main className="flex flex-1 items-center justify-center p-4">
      <Card className="w-full max-w-sm p-6 sm:p-8">
        <h1 className="text-center text-xl font-bold text-primary">بوابة الأنشطة</h1>
        <p className="mb-6 mt-1 text-center text-sm text-muted">دخول الإدارة والمشرفين</p>
        <LoginForm />
      </Card>
    </main>
  );
}
