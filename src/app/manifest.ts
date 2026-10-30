import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "بوابة الأنشطة — جامعة الزقازيق الأهلية",
    short_name: "بوابة الأنشطة",
    description: "رحلات الجامعة، الحجز، و QR الحضور",
    lang: "ar",
    dir: "rtl",
    // "/" sends students to their portal and staff to the dashboard.
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#f6f7f9",
    theme_color: "#0f5c4c",
    icons: [
      { src: "/pwa-icon/192", sizes: "192x192", type: "image/png" },
      { src: "/pwa-icon/512", sizes: "512x512", type: "image/png" },
      { src: "/pwa-icon/512", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
