/** General system settings (plan §8.5). Values are stored as JSON in the `settings` table. */
export const SETTINGS = {
  duplicate_national_id_policy: {
    label: "حجز جديد برقم قومي موجود ببيانات مختلفة",
    options: {
      update: "تحديث بالبيانات الجديدة",
      keep: "الاحتفاظ بالبيانات القديمة",
      flag: "الحجز يدخل بعلامة \"بيانات مختلفة\" والأدمن يختار",
    },
    default: "flag",
  },
  student_login_non_confirmed: {
    label: "دخول الطالب اللي حجزه معلّق أو ملغي",
    options: {
      allowed: "مسموح (يشوف حالة حجزه بس)",
      denied: "ممنوع (المؤكدين بس)",
    },
    default: "allowed",
  },
  supervisor_trip_visibility: {
    label: "الرحلات اللي يشوفها المشرف",
    options: {
      all: "كل الرحلات",
      assigned: "الرحلات المضاف عليها بس",
    },
    default: "assigned",
  },
  restore_absent_student: {
    label: "إرجاع طالب متعلّم غياب نهائي",
    options: {
      allowed: "مسموح للأدمن (يرجع الكشف ويظهر في التجمعات الجاية)",
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
