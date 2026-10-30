import { db } from "@/db";
import { auditLogs } from "@/db/schema";

export type RequestCtx = { ip: string | null; userAgent: string | null };
export type Actor = { type: "user"; id: number } | { type: "student"; id: number } | { type: "system" };

type AuditEntry = {
  actor: Actor | null;
  action: string;
  subjectType?: string;
  subjectId?: string | number;
  meta?: Record<string, unknown>;
};

export async function recordAudit(entry: AuditEntry, ctx?: RequestCtx) {
  await db.insert(auditLogs).values({
    actorType: entry.actor?.type ?? "anonymous",
    actorId: entry.actor && "id" in entry.actor ? entry.actor.id : null,
    action: entry.action,
    subjectType: entry.subjectType ?? null,
    subjectId: entry.subjectId != null ? String(entry.subjectId) : null,
    meta: entry.meta ?? null,
    ip: ctx?.ip ?? null,
    userAgent: ctx?.userAgent?.slice(0, 500) ?? null,
  });
}

/** Arabic labels for the audit-log viewer. Unknown actions fall back to the raw key. */
export const AUDIT_ACTION_LABELS: Record<string, string> = {
  "auth.login": "تسجيل دخول",
  "auth.login_failed": "محاولة دخول فاشلة",
  "auth.login_locked": "حظر مؤقت بعد محاولات فاشلة",
  "auth.login_frozen": "محاولة دخول بحساب مجمّد",
  "auth.logout": "تسجيل خروج",
  "auth.password_changed": "تغيير الباسورد",
  "user.super_admin_seeded": "إنشاء السوبر أدمن",
  "admin.created": "إضافة أدمن",
  "admin.frozen": "تجميد أدمن",
  "admin.unfrozen": "إلغاء تجميد أدمن",
  "admin.deleted": "حذف أدمن",
  "admin.password_reset": "تغيير باسورد أدمن",
  "settings.updated": "تعديل الإعدادات العامة",
  "faculty.created": "إضافة كلية",
  "faculty.updated": "تعديل كلية",
  "activity.created": "إضافة رحلة",
  "activity.updated": "تعديل رحلة",
  "activity.deleted": "حذف رحلة",
  "bus.created": "إضافة أتوبيس",
  "bus.updated": "تعديل أتوبيس",
  "bus.deleted": "حذف أتوبيس",
  "bus.auto_assigned": "توزيع تلقائي على الأتوبيسات",
  "activity.booking_opened": "فتح الحجز",
  "activity.booking_closed": "قفل الحجز",
  "booking.submitted": "حجز من الفورم",
  "booking.manual_added": "إضافة طالب يدويًا",
  "booking.confirmed": "تأكيد حجز",
  "booking.cancelled": "إلغاء حجز",
  "booking.promoted": "ترقية من قائمة الانتظار",
  "booking.payment_recorded": "تسجيل دفع",
  "booking.payment_removed": "إلغاء تسجيل دفع",
  "booking.data_applied": "تحديث بيانات طالب من الحجز",
  "booking.data_kept": "الاحتفاظ ببيانات الطالب القديمة",
  "booking.bus_assigned": "تسكين طالب في أتوبيس",
};
