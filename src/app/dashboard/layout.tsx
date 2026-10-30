import { LogoutButton } from "@/components/logout-button";
import { STAFF_QR_KEY } from "@/components/qr/offline-store";
import { Preferences } from "@/components/preferences";
import { getT, getTheme } from "@/i18n/server";
import { staffUnreadCount } from "@/lib/announcements/service";
import { requireUser } from "@/lib/auth/session";
import { ROLE_LABELS, can } from "@/lib/authz";
import { logout } from "./actions";
import { Nav, type NavItem } from "./nav";

export default async function DashboardLayout({ children }: LayoutProps<"/dashboard">) {
  const user = await requireUser();
  const [t, theme] = await Promise.all([getT(), getTheme()]);

  const items: NavItem[] = [{ href: "/dashboard", label: t("الرئيسية") }];
  if (can(user, "view_trips")) {
    items.push({ href: "/dashboard/trips", label: t("الرحلات") });
    items.push({
      href: "/dashboard/announcements",
      label: t("الإعلانات"),
      unread: { endpoint: "/dashboard/announcements/unread", initial: await staffUnreadCount(user) },
    });
  }
  if (can(user, "manage_supervisors")) items.push({ href: "/dashboard/supervisors", label: t("المشرفون") });
  if (can(user, "manage_activities")) items.push({ href: "/dashboard/students", label: t("الطلاب") });
  if (can(user, "manage_faculties")) items.push({ href: "/dashboard/faculties", label: t("الكليات") });
  if (can(user, "manage_admins")) items.push({ href: "/dashboard/admins", label: t("المسؤولون") });
  if (can(user, "manage_settings")) items.push({ href: "/dashboard/settings", label: t("الإعدادات") });
  if (can(user, "view_audit")) items.push({ href: "/dashboard/audit", label: t("سجل العمليات") });
  if (user.role === "supervisor") items.push({ href: "/dashboard/my-qr", label: t("رمز الحضور") });
  items.push({ href: "/dashboard/account", label: t("حسابي") });

  return (
    <div className="flex min-h-full flex-1 flex-col">
      <header className="border-b border-border bg-surface print:hidden">
        <div className="mx-auto max-w-6xl space-y-3 px-4 py-3">
          <div className="flex items-center justify-between gap-3">
            <span className="font-bold text-primary">{t("بوابة الأنشطة")}</span>
            <div className="flex items-center gap-3 text-sm">
              <span className="hidden text-muted sm:inline">
                {user.name} · {t(ROLE_LABELS[user.role])}
              </span>
              <Preferences theme={theme} />
              <LogoutButton action={logout} storageKey={STAFF_QR_KEY} />
            </div>
          </div>
          <Nav items={items} />
        </div>
      </header>
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 print:max-w-none print:p-0">{children}</main>
    </div>
  );
}
