/** General system settings (plan §8.5). Values are stored as JSON in the `settings` table. */
export const SETTINGS = {
  duplicate_national_id_policy: {
    label: "حجز جديد برقم قومي مسجَّل ببيانات مختلفة",
    options: {
      update: "التحديث بالبيانات الجديدة",
      keep: "الاحتفاظ بالبيانات القديمة",
      flag: "يُسجَّل الحجز بعلامة «بيانات مختلفة» ويختار المسؤول",
    },
    default: "flag",
  },
  student_login_non_confirmed: {
    label: "دخول الطالب الذي حجزه معلّق أو ملغى",
    options: {
      allowed: "مسموح (يرى حالة حجزه فقط)",
      denied: "ممنوع (للحجوزات المؤكدة فقط)",
    },
    default: "allowed",
  },
  supervisor_trip_visibility: {
    label: "الرحلات التي يراها المشرف",
    options: {
      all: "كل الرحلات",
      assigned: "الرحلات المضاف إليها فقط",
    },
    default: "assigned",
  },
  restore_absent_student: {
    label: "إعادة طالب مسجَّل غيابه نهائيًا",
    options: {
      allowed: "مسموح للمسؤول (يعود إلى الكشف ويظهر في التجمعات التالية)",
      denied: "ممنوع",
    },
    default: "allowed",
  },
} as const;

export type SettingKey = keyof typeof SETTINGS;
export type SettingValue<K extends SettingKey> = keyof (typeof SETTINGS)[K]["options"];
export type SettingsMap = { [K in SettingKey]: SettingValue<K> };

export const SETTING_KEYS = Object.keys(SETTINGS) as SettingKey[];

export function isValidSettingValue(key: string, value: unknown): boolean {
  if (!(key in SETTINGS)) return false;
  return typeof value === "string" && value in SETTINGS[key as SettingKey].options;
}

export const DEFAULT_SETTINGS = Object.fromEntries(
  SETTING_KEYS.map((k) => [k, SETTINGS[k].default]),
) as SettingsMap;
