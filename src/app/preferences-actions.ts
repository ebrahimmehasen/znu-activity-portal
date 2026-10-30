"use server";

import { cookies } from "next/headers";
import { LOCALE_COOKIE, PREFERENCE_MAX_AGE, THEME_COOKIE, isLocale, isTheme } from "@/i18n/config";

/** Language and theme live in plain cookies so the server renders the page right away. */
async function save(name: string, value: string) {
  (await cookies()).set(name, value, {
    path: "/",
    maxAge: PREFERENCE_MAX_AGE,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
  });
}

export async function setLocaleAction(locale: string) {
  if (isLocale(locale)) await save(LOCALE_COOKIE, locale);
}

export async function setThemeAction(theme: string) {
  if (isTheme(theme)) await save(THEME_COOKIE, theme);
}
