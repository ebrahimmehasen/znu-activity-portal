"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { setLocaleAction, setThemeAction } from "@/app/preferences-actions";
import type { Theme } from "@/i18n/config";
import { useLocale, useT } from "@/i18n/client";

const NEXT_THEME: Record<Theme, Theme> = { system: "light", light: "dark", dark: "system" };

function ThemeIcon({ theme }: { theme: Theme }) {
  const common = { width: 18, height: 18, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round", strokeLinejoin: "round" } as const;
  if (theme === "light")
    return (
      <svg {...common} aria-hidden>
        <circle cx="12" cy="12" r="4" />
        <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
      </svg>
    );
  if (theme === "dark")
    return (
      <svg {...common} aria-hidden>
        <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
      </svg>
    );
  return (
    <svg {...common} aria-hidden>
      <rect x="2" y="4" width="20" height="13" rx="2" />
      <path d="M8 21h8M12 17v4" />
    </svg>
  );
}

/** Language and light/dark switches for every header. */
export function Preferences({ theme }: { theme: Theme }) {
  const t = useT();
  const locale = useLocale();
  const router = useRouter();
  const [pending, start] = useTransition();
  const themeLabel = { system: t("حسب الجهاز"), light: t("الوضع الفاتح"), dark: t("الوضع الداكن") }[theme];

  const apply = (fn: () => Promise<void>, after?: () => void) =>
    start(async () => {
      await fn();
      after?.();
      router.refresh();
    });

  return (
    <div className="flex items-center gap-1">
      <button
        type="button"
        disabled={pending}
        onClick={() => apply(() => setLocaleAction(locale === "ar" ? "en" : "ar"))}
        className="rounded-lg px-2 py-1.5 text-sm font-semibold text-muted hover:bg-background hover:text-foreground"
        lang={locale === "ar" ? "en" : "ar"}
        aria-label={locale === "ar" ? "Switch to English" : "التبديل إلى العربية"}
      >
        {locale === "ar" ? "EN" : "ع"}
      </button>
      <button
        type="button"
        disabled={pending}
        onClick={() => {
          const next = NEXT_THEME[theme];
          // Apply at once; the cookie keeps it for the next page load.
          if (next === "system") document.documentElement.removeAttribute("data-theme");
          else document.documentElement.setAttribute("data-theme", next);
          apply(() => setThemeAction(next));
        }}
        className="rounded-lg p-1.5 text-muted hover:bg-background hover:text-foreground"
        title={themeLabel}
        aria-label={`${t("المظهر")}: ${themeLabel}`}
      >
        <ThemeIcon theme={theme} />
      </button>
    </div>
  );
}
