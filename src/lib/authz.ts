import type { UserRole } from "@/db/schema";

/**
 * Role abilities. Supervisor abilities come from per-user permissions (phase 4);
 * until then supervisors only reach their own account pages.
 */
const ROLE_ABILITIES = {
  super_admin: [
    "manage_admins",
    "manage_settings",
    "view_audit",
    "manage_faculties",
    "manage_activities",
    "add_students",
    "confirm_bookings",
    "cancel_bookings",
  ],
  admin: ["view_audit", "manage_faculties", "manage_activities", "add_students", "confirm_bookings", "cancel_bookings"],
  supervisor: [],
} as const satisfies Record<UserRole, readonly string[]>;

export type Ability = (typeof ROLE_ABILITIES)["super_admin"][number];

export function can(user: { role: UserRole }, ability: Ability): boolean {
  return (ROLE_ABILITIES[user.role] as readonly string[]).includes(ability);
}

export const ROLE_LABELS: Record<UserRole, string> = {
  super_admin: "سوبر أدمن",
  admin: "أدمن",
  supervisor: "مشرف",
};
