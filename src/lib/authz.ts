import type { SupervisorPermission, UserRole } from "@/db/schema";

/** The checkboxes on the supervisors page (plan §5.4), in display order. */
export const SUPERVISOR_PERMISSIONS: Record<SupervisorPermission, { label: string; hint?: string }> = {
  add_students: { label: "تسجيل الطلاب يدويًا" },
  confirm_bookings: { label: "تأكيد الحجوزات" },
  cancel_bookings: { label: "إلغاء الحجوزات" },
  take_attendance: { label: "تسجيل الحضور (رمز QR أو يدويًا)" },
  direct_attendance: { label: "تأكيد الحضور مباشرةً", hint: "تُعتمد تسجيلاته فورًا دون انتظار المسؤول" },
  manage_gatherings: { label: "إضافة التجمعات وفتحها وإغلاقها" },
  send_announcements: { label: "إرسال الإعلانات" },
  view_trip_dashboard: { label: "عرض لوحة متابعة الرحلة" },
};

export const SUPERVISOR_PERMISSION_KEYS = Object.keys(SUPERVISOR_PERMISSIONS) as SupervisorPermission[];

const ADMIN_ABILITIES = [
  "view_audit",
  "manage_faculties",
  "manage_activities",
  "manage_supervisors",
  "view_trips",
  "see_national_id",
  ...SUPERVISOR_PERMISSION_KEYS,
] as const;

/** Supervisors get `view_trips` by role; everything else comes from their granted permissions. */
const ROLE_ABILITIES = {
  super_admin: ["manage_admins", "manage_settings", ...ADMIN_ABILITIES],
  admin: ADMIN_ABILITIES,
  supervisor: ["view_trips"],
} as const satisfies Record<UserRole, readonly string[]>;

export type Ability = (typeof ROLE_ABILITIES)["super_admin"][number];

export type Actor = { role: UserRole; permissions?: readonly SupervisorPermission[] };

export function can(user: Actor, ability: Ability): boolean {
  if ((ROLE_ABILITIES[user.role] as readonly string[]).includes(ability)) return true;
  return user.role === "supervisor" && (user.permissions ?? []).includes(ability as SupervisorPermission);
}

export const isStaffAdmin = (user: Actor) => user.role !== "supervisor";

export const ROLE_LABELS: Record<UserRole, string> = {
  super_admin: "المسؤول الرئيسي",
  admin: "مسؤول",
  supervisor: "مشرف",
};
