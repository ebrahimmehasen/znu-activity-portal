import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { EN } from "@/i18n/en";
import { translate } from "@/i18n/translate";

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? sourceFiles(p) : /\.tsx?$/.test(name) ? [p] : [];
  });
}

describe("translate", () => {
  it("keeps Arabic as is and fills placeholders", () => {
    expect(translate("ar", "مرحبًا {name}", { name: "سارة" })).toBe("مرحبًا سارة");
  });

  it("translates exact texts and placeholder templates to English", () => {
    expect(translate("en", "الرحلات")).toBe("Trips");
    expect(translate("en", "مرحبًا {name}", { name: "Sara" })).toBe("Hello Sara");
  });

  it("matches messages built elsewhere against the templates", () => {
    // A service returns the Arabic sentence with the values already in it.
    expect(translate("en", "أغلق «بعد الغداء» أولًا")).toBe("Close “بعد الغداء” first");
    expect(translate("en", "يوجد 3 تسجيل بانتظار التأكيد")).toBe("3 records are waiting for confirmation");
  });

  it("falls back to the Arabic text when there is no English", () => {
    expect(translate("en", "نص غير مترجم")).toBe("نص غير مترجم");
  });

  it("has English for every t(\"…\") text in the app", () => {
    const keys = new Set<string>();
    for (const file of sourceFiles("src")) {
      for (const m of readFileSync(file, "utf8").matchAll(/(?<![\w.])(?:t|tr)\("((?:[^"\\]|\\.)*)"/g)) {
        if (/[؀-ۿ]/.test(m[1])) keys.add(m[1]);
      }
    }
    const missing = [...keys].filter((k) => !(k in EN));
    expect(missing).toEqual([]);
  });
});
