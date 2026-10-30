import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Card } from "@/components/ui";
import { getCurrentStudent } from "@/lib/students/session";
import { StudentLoginForm } from "./login-form";

export const metadata: Metadata = { title: "دخول الطلبة" };

export default async function StudentLoginPage() {
  if (await getCurrentStudent()) redirect("/portal");

  return (
    <main className="flex flex-1 items-center justify-center p-4">
      <Card className="w-full max-w-sm p-6 sm:p-8">
        <h1 className="text-center text-xl font-bold text-primary">بوابة الطلبة</h1>
        <p className="mb-6 mt-1 text-center text-sm text-muted">ادخل بنفس رقم الهاتف والرقم القومي اللي حجزت بيهم</p>
        <StudentLoginForm />
        <p className="mt-6 text-center text-xs text-muted">
          <Link href="/login" className="hover:text-primary">
            دخول الإدارة والمشرفين
          </Link>
        </p>
      </Card>
    </main>
  );
}
