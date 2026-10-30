import { z } from "zod";

/** Students type on phones, often with Arabic-Indic or Persian digits. */
export function toLatinDigits(value: string) {
  return value
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0));
}

const digitsOnly = (v: unknown) => (typeof v === "string" ? toLatinDigits(v).replace(/[\s-]/g, "") : v);

// Governorate codes used in Egyptian national IDs (digits 8–9); 88 = born abroad.
const GOVERNORATE_CODES = new Set([
  "01", "02", "03", "04", "11", "12", "13", "14", "15", "16", "17", "18", "19",
  "21", "22", "23", "24", "25", "26", "27", "28", "29", "31", "32", "33", "34", "35", "88",
]);

/**
 * Structure of an Egyptian national ID: C YYMMDD GG SSSS K
 * C = century (2 → 1900s, 3 → 2000s), then birth date, governorate, serial, check digit.
 */
export function isValidNationalId(id: string, today = new Date()) {
  if (!/^[23]\d{13}$/.test(id)) return false;
  const year = (id[0] === "2" ? 1900 : 2000) + Number(id.slice(1, 3));
  const month = Number(id.slice(3, 5));
  const day = Number(id.slice(5, 7));
  const birth = new Date(Date.UTC(year, month - 1, day));
  if (birth.getUTCFullYear() !== year || birth.getUTCMonth() !== month - 1 || birth.getUTCDate() !== day) return false;
  if (birth > today) return false;
  return GOVERNORATE_CODES.has(id.slice(7, 9));
}

export const phoneSchema = z.preprocess(
  digitsOnly,
  z.string().regex(/^01[0125]\d{8}$/, "يجب أن يتكون رقم الهاتف من 11 رقمًا ويبدأ بـ 010 أو 011 أو 012 أو 015"),
);

export const nationalIdSchema = z.preprocess(
  digitsOnly,
  z
    .string()
    .regex(/^\d{14}$/, "يجب أن يتكون الرقم القومي من 14 رقمًا")
    .refine((v) => isValidNationalId(v), "الرقم القومي غير صحيح، راجعه مرة أخرى"),
);

export const studentInputSchema = z.object({
  name: z
    .string()
    .transform((v) => v.trim().replace(/\s+/g, " "))
    .pipe(
      z
        .string()
        .max(200, "الاسم طويل جدًا")
        .refine((v) => v.split(" ").length >= 4, "أدخل الاسم رباعيًا"),
    ),
  phone: phoneSchema,
  nationalId: nationalIdSchema,
  facultyId: z.coerce.number({ message: "اختر الكلية" }).int().positive("اختر الكلية"),
  year: z.coerce.number({ message: "اختر الفرقة" }).int().min(1, "اختر الفرقة").max(5, "اختر الفرقة"),
});

export type StudentInput = z.input<typeof studentInputSchema>;
export type StudentData = z.output<typeof studentInputSchema>;

export const YEAR_LABELS: Record<number, string> = {
  1: "الفرقة الأولى",
  2: "الفرقة الثانية",
  3: "الفرقة الثالثة",
  4: "الفرقة الرابعة",
  5: "الفرقة الخامسة",
};

/** Supervisors see national IDs masked (plan §5.4); only admins see them in full. */
export function maskNationalId(id: string) {
  return `${"•".repeat(Math.max(0, id.length - 4))}${id.slice(-4)}`;
}
