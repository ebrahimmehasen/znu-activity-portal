import "server-only";
import { cookies } from "next/headers";
import { cache } from "react";
import { DEFAULT_LOCALE, LOCALE_COOKIE, THEME_COOKIE, isLocale, isTheme, type Theme } from "./config";
import { makeT } from "./translate";

/** The visitor's language from their cookie (Arabic by default). */
export const getLocale = cache(async () => {
  const v = (await cookies()).get(LOCALE_COOKIE)?.value;
  return isLocale(v) ? v : DEFAULT_LOCALE;
});

export const getTheme = cache(async (): Promise<Theme> => {
  const v = (await cookies()).get(THEME_COOKIE)?.value;
  return isTheme(v) ? v : "system";
});

export async function getT() {
  return makeT(await getLocale());
}

/** Both at once, for pages that format dates too. */
export async function getI18n() {
  const locale = await getLocale();
  return { locale, t: makeT(locale) };
}
