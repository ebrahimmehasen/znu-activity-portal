/** Shared by server and client: the supported languages and themes, and their cookies. */

export const LOCALES = ["ar", "en"] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = "ar";
export const LOCALE_COOKIE = "znu_locale";
export const isLocale = (v: unknown): v is Locale => typeof v === "string" && (LOCALES as readonly string[]).includes(v);
export const dirOf = (locale: Locale) => (locale === "ar" ? "rtl" : "ltr");
/** For Intl date and number formatting. */
export const intlLocale = (locale: Locale) => (locale === "ar" ? "ar-EG" : "en-GB");

/** "system" follows the device setting. */
export const THEMES = ["system", "light", "dark"] as const;
export type Theme = (typeof THEMES)[number];
export const THEME_COOKIE = "znu_theme";
export const isTheme = (v: unknown): v is Theme => typeof v === "string" && (THEMES as readonly string[]).includes(v);

export const PREFERENCE_MAX_AGE = 60 * 60 * 24 * 365;
