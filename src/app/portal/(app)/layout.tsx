import Link from "next/link";
import { LogoutButton } from "@/components/logout-button";
import { STUDENT_QR_KEY } from "@/components/qr/offline-store";
import { requireStudent } from "@/lib/students/session";
import { studentLogout } from "../actions";

export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  const student = await requireStudent();
  return (
    <div className="flex min-h-full flex-1 flex-col">
      <header className="border-b border-border bg-surface">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-3 px-4 py-3">
          <Link href="/portal" className="font-bold text-primary">
            بوابة الطلبة
          </Link>
          <div className="flex items-center gap-3 text-sm">
            <span className="hidden text-muted sm:inline">{student.name}</span>
            <LogoutButton action={studentLogout} storageKey={STUDENT_QR_KEY} />
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-6">{children}</main>
    </div>
  );
}
