import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "بوابة الأنشطة — جامعة الزقازيق الأهلية",
    short_name: "بوابة الأنشطة",
    description: "رحلات الجامعة والحجز ورمز الحضور",
    lang: "ar",
    dir: "rtl",
    // "/" sends students to their portal and staff to the dashboard.
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#f6f7f9",
    theme_color: "#0f5c4c",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
