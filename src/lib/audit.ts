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
  "auth.login": "تسجيل الدخول",
  "auth.login_failed": "محاولة دخول فاشلة",
  "auth.login_locked": "حظر مؤقت بعد محاولات فاشلة",
  "auth.login_frozen": "محاولة دخول بحساب مجمَّد",
  "auth.logout": "تسجيل الخروج",
  "auth.password_changed": "تغيير كلمة المرور",
  "user.super_admin_seeded": "إنشاء المسؤول الرئيسي",
  "user.super_admin_reset": "تغيير اسم مستخدم المسؤول الرئيسي وكلمة مروره من الخادم",
  "admin.created": "إضافة مسؤول",
  "admin.frozen": "تجميد مسؤول",
  "admin.unfrozen": "إلغاء تجميد مسؤول",
  "admin.deleted": "حذف مسؤول",
  "student.login": "دخول طالب",
  "student.login_failed": "محاولة دخول طالب فاشلة",
  "student.logout": "خروج طالب",
  "supervisor.created": "إضافة مشرف",
  "supervisor.frozen": "تجميد مشرف",
  "supervisor.unfrozen": "إلغاء تجميد مشرف",
  "supervisor.deleted": "حذف مشرف",
  "supervisor.password_reset": "تغيير كلمة مرور مشرف",
  "supervisor.permissions_changed": "تعديل صلاحيات مشرف",
  "activity.supervisor_added": "إضافة مشرف إلى رحلة",
  "activity.supervisor_removed": "إزالة مشرف من رحلة",
  "activity.supervisor_bus_set": "تعيين مشرف على حافلة",
  "admin.password_reset": "تغيير كلمة مرور مسؤول",
  "settings.updated": "تعديل الإعدادات العامة",
  "faculty.created": "إضافة كلية",
  "faculty.updated": "تعديل كلية",
  "activity.created": "إضافة رحلة",
  "activity.updated": "تعديل رحلة",
  "activity.deleted": "حذف رحلة",
  "bus.created": "إضافة حافلة",
  "bus.updated": "تعديل حافلة",
  "bus.deleted": "حذف حافلة",
  "bus.auto_assigned": "توزيع تلقائي على الحافلات",
  "activity.booking_opened": "فتح الحجز",
  "activity.booking_closed": "إغلاق الحجز",
  "booking.submitted": "حجز من النموذج",
  "booking.manual_added": "إضافة طالب يدويًا",
  "booking.confirmed": "تأكيد حجز",
  "booking.cancelled": "إلغاء حجز",
  "booking.promoted": "نقل من قائمة الانتظار",
  "booking.payment_recorded": "تسجيل دفع",
  "booking.payment_removed": "إلغاء تسجيل دفع",
  "booking.data_applied": "تحديث بيانات طالب من الحجز",
  "booking.data_kept": "الاحتفاظ ببيانات الطالب القديمة",
  "booking.bus_assigned": "تعيين طالب على حافلة",
  "activity.started": "بدء الرحلة",
  "activity.ended": "إنهاء الرحلة",
  "activity.reopened": "إعادة رحلة منتهية إلى جارية",
  "activity.roster_locked": "تأكيد عدد الرحلة",
  "checkpoint.created": "إضافة تجمع",
  "checkpoint.opened": "فتح تجمع",
  "checkpoint.closed": "إغلاق تجمع",
  "attendance.marked_absent": "تسجيل غياب",
  "attendance.remaining_absent": "تسجيل غياب الباقين",
  "attendance.confirmed": "تأكيد حضور",
  "attendance.voided": "إلغاء تسجيل حضور",
  "attendance.restored": "إعادة طالب مسجَّل غيابه",
  "attendance.supervisor_removed": "إلغاء حضور مشرف",
  "announcement.sent": "إرسال إعلان",
  "announcement.deleted": "حذف إعلان",
  "report.exported": "تصدير تقرير رحلة",
  "activity.purged": "حذف بيانات رحلة",
  "student.purged": "حذف بيانات طالب",
};
