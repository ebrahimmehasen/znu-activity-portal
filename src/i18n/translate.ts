import type { Locale } from "./config";
import { EN } from "./en";

/**
 * Arabic is the source language: every text in the code is written in Arabic and doubles
 * as its translation key (gettext style), so an untranslated text still shows in Arabic.
 * `{name}` placeholders are filled from `vars`. Messages built elsewhere with the values
 * already inside (service errors such as «الرحلة {trip} …») are matched against the
 * templates in the dictionary.
 */

export type Vars = Record<string, string | number>;
export type T = (text: string, vars?: Vars) => string;

const fill = (s: string, vars?: Vars) => (vars ? s.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m)) : s);

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const patterns = Object.entries(EN)
  .filter(([ar]) => /\{\w+\}/.test(ar))
  .map(([ar, en]) => {
    const names: string[] = [];
    const source = ar
      .split(/(\{\w+\})/)
      .map((part) => {
        const m = /^\{(\w+)\}$/.exec(part);
        if (!m) return escape(part);
        names.push(m[1]);
        return "(.+?)";
      })
      .join("");
    return { re: new RegExp(`^${source}$`, "s"), names, en };
  });

export function translate(locale: Locale, text: string, vars?: Vars): string {
  if (locale === "ar") return fill(text, vars);
  const direct = EN[text];
  if (direct !== undefined) return fill(direct, vars);
  if (!vars) {
    for (const p of patterns) {
      const m = p.re.exec(text);
      if (m) return fill(p.en, Object.fromEntries(p.names.map((n, i) => [n, m[i + 1]])));
    }
  }
  return fill(text, vars);
}

export const makeT =
  (locale: Locale): T =>
  (text, vars) =>
    translate(locale, text, vars);
