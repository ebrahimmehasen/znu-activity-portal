import Link from "next/link";
import { LogoutButton } from "@/components/logout-button";
import { STUDENT_QR_KEY } from "@/components/qr/offline-store";
import { UnreadBadge } from "@/components/unread-badge";
import { Preferences } from "@/components/preferences";
import { getT, getTheme } from "@/i18n/server";
import { studentUnreadCount } from "@/lib/announcements/service";
import { requireStudent } from "@/lib/students/session";
import { studentLogout } from "../actions";

export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  const student = await requireStudent();
  const [unread, t, theme] = await Promise.all([studentUnreadCount(student.id), getT(), getTheme()]);
  return (
    <div className="flex min-h-full flex-1 flex-col">
      <header className="sticky top-0 z-20 border-b border-border bg-surface glass">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-3 px-4 py-3">
          <Link href="/portal" className="font-bold text-primary">
            {t("بوابة الطلاب")}
          </Link>
          <div className="flex items-center gap-3 text-sm">
            <Link href="/portal/announcements" className="inline-flex items-center font-medium text-muted hover:text-foreground">
              {t("الإعلانات")}
              <UnreadBadge endpoint="/portal/announcements/unread" initial={unread} refreshUnder="/portal/announcements" />
            </Link>
            <span className="hidden text-muted sm:inline">{student.name}</span>
            <Preferences theme={theme} />
            <LogoutButton action={studentLogout} storageKey={STUDENT_QR_KEY} />
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-6">{children}</main>
    </div>
  );
}
