import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "بوابة الأنشطة — جامعة الزقازيق الأهلية",
    template: "%s | بوابة الأنشطة",
  },
  description: "بوابة إدارة أنشطة جامعة الزقازيق الأهلية",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#0f5c4c",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="ar" dir="rtl" className="h-full antialiased">
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
