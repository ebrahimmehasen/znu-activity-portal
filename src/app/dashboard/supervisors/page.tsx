import type { Metadata } from "next";
import { ActionButton } from "@/components/action-button";
import { Badge, Card, PageHeader } from "@/components/ui";
import { requireAbility } from "@/lib/auth/session";
import { SUPERVISOR_PERMISSIONS } from "@/lib/authz";
import { listSupervisors } from "@/lib/supervisors/service";
import { deleteSupervisorAction, toggleSupervisorAction } from "./actions";
import { CreateSupervisorForm, PermissionsForm, ResetPasswordForm } from "./forms";

export const metadata: Metadata = { title: "المشرفين" };

export default async function SupervisorsPage() {
  await requireAbility("manage_supervisors");
  const supervisors = await listSupervisors();

  return (
    <>
      <PageHeader
        title="المشرفين والصلاحيات"
        description="المشرف بيعمل اللي انت تسمحله بيه بس. أي تغيير في الصلاحيات بيتطبق فورًا، والرقم القومي بيظهرله مخفي."
      />

      <Card className="mb-6">
        <h2 className="mb-4 font-semibold">إضافة مشرف</h2>
        <CreateSupervisorForm />
      </Card>

      {supervisors.length === 0 ? (
        <Card className="py-10 text-center text-muted">مفيش مشرفين لسه.</Card>
      ) : (
        <div className="space-y-3">
          {supervisors.map((s) => (
            <Card key={s.id} className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <div className="font-semibold">{s.name}</div>
                  <div className="ltr-nums text-sm text-muted">{s.username}</div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Badge>{s.trips ? `${s.trips} رحلة` : "مش مضاف على رحلات"}</Badge>
                  {s.isActive ? <Badge tone="success">نشط</Badge> : <Badge tone="danger">مجمّد</Badge>}
                </div>
              </div>

              <div className="flex flex-wrap gap-1.5">
                {s.permissions.length === 0 ? (
                  <span className="text-sm text-muted">من غير صلاحيات — بيشوف الرحلات والكشف بس.</span>
                ) : (
                  s.permissions.map((p) => <Badge key={p}>{SUPERVISOR_PERMISSIONS[p].label}</Badge>)
                )}
              </div>

              <div className="flex flex-wrap items-start gap-3 border-t border-border pt-3">
                <ActionButton
                  action={toggleSupervisorAction}
                  fields={{ id: s.id, active: s.isActive ? "0" : "1" }}
                  variant="secondary"
                  confirm={s.isActive ? `تجميد ${s.name}؟ هيتعمله خروج فورًا.` : undefined}
                >
                  {s.isActive ? "تجميد" : "إلغاء التجميد"}
                </ActionButton>
                <ActionButton action={deleteSupervisorAction} fields={{ id: s.id }} variant="danger" confirm={`حذف ${s.name}؟ هيتشال من كل الرحلات.`}>
                  حذف
                </ActionButton>
                <details className="min-w-full sm:min-w-80 sm:flex-1">
                  <summary className="cursor-pointer py-2 text-sm text-primary">تعديل الصلاحيات</summary>
                  <div className="pt-2">
                    <PermissionsForm id={s.id} selected={s.permissions} />
                  </div>
                </details>
                <details className="min-w-60">
                  <summary className="cursor-pointer py-2 text-sm text-primary">تغيير الباسورد</summary>
                  <div className="pt-2">
                    <ResetPasswordForm id={s.id} />
                  </div>
                </details>
              </div>
            </Card>
          ))}
        </div>
      )}
    </>
  );
}
