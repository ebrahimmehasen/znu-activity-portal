import type { Metadata, Viewport } from "next";
import { ServiceWorkerRegister } from "@/components/sw-register";
import { dirOf } from "@/i18n/config";
import { I18nProvider } from "@/i18n/client";
import { getLocale, getT, getTheme } from "@/i18n/server";
import "./globals.css";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  const name = t("بوابة الأنشطة");
  return {
    title: { default: `${name} — ${t("جامعة الزقازيق الأهلية")}`, template: `%s | ${name}` },
    description: t("بوابة إدارة أنشطة جامعة الزقازيق الأهلية"),
    appleWebApp: { capable: true, title: name, statusBarStyle: "default" },
    icons: { apple: "/icon-192.png" },
  };
}

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#0f5c4c" },
    { media: "(prefers-color-scheme: dark)", color: "#0e1217" },
  ],
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const [locale, theme] = await Promise.all([getLocale(), getTheme()]);
  return (
    <html lang={locale} dir={dirOf(locale)} data-theme={theme === "system" ? undefined : theme} className="h-full antialiased">
      <body className="min-h-full flex flex-col">
        <I18nProvider locale={locale}>{children}</I18nProvider>
        <ServiceWorkerRegister />
      </body>
    </html>
  );
}
