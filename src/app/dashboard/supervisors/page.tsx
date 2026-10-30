import type { Metadata } from "next";
import { getT } from "@/i18n/server";
import { ActionButton } from "@/components/action-button";
import { Badge, Card, PageHeader } from "@/components/ui";
import { requireAbility } from "@/lib/auth/session";
import { SUPERVISOR_PERMISSIONS } from "@/lib/authz";
import { listSupervisors } from "@/lib/supervisors/service";
import { deleteSupervisorAction, toggleSupervisorAction } from "./actions";
import { CreateSupervisorForm, PermissionsForm, ResetPasswordForm } from "./forms";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getT())("المشرفون") };
}

export default async function SupervisorsPage() {
  await requireAbility("manage_supervisors");
  const supervisors = await listSupervisors();
  const t = await getT();

  return (
    <>
      <PageHeader
        title={t("المشرفون والصلاحيات")}
        description={t("لا يفعل المشرف إلا ما تسمح له به. يُطبَّق أي تغيير في الصلاحيات فورًا، ويظهر له الرقم القومي مخفيًا.")}
      />

      <Card className="mb-6">
        <h2 className="mb-4 font-semibold">{t("إضافة مشرف")}</h2>
        <CreateSupervisorForm />
      </Card>

      {supervisors.length === 0 ? (
        <Card className="py-10 text-center text-muted">{t("لا يوجد مشرفون بعد.")}</Card>
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
                  <Badge>{s.trips ? t("{n} رحلة", { n: s.trips }) : t("غير مضاف إلى رحلات")}</Badge>
                  {s.isActive ? <Badge tone="success">{t("نشط")}</Badge> : <Badge tone="danger">{t("مجمَّد")}</Badge>}
                </div>
              </div>

              <div className="flex flex-wrap gap-1.5">
                {s.permissions.length === 0 ? (
                  <span className="text-sm text-muted">{t("بدون صلاحيات — يرى الرحلات والكشف فقط.")}</span>
                ) : (
                  s.permissions.map((p) => <Badge key={p}>{t(SUPERVISOR_PERMISSIONS[p].label)}</Badge>)
                )}
              </div>

              <div className="flex flex-wrap items-start gap-3 border-t border-border pt-3">
                <ActionButton
                  action={toggleSupervisorAction}
                  fields={{ id: s.id, active: s.isActive ? "0" : "1" }}
                  variant="secondary"
                  confirm={s.isActive ? t("تجميد {name}؟ سيُسجَّل خروجه فورًا.", { name: s.name }) : undefined}
                >
                  {s.isActive ? t("تجميد") : t("إلغاء التجميد")}
                </ActionButton>
                <ActionButton action={deleteSupervisorAction} fields={{ id: s.id }} variant="danger" confirm={t("حذف {name}؟ سيُزال من كل الرحلات.", { name: s.name })}>
                  {t("حذف")}
                </ActionButton>
                <details className="min-w-full sm:min-w-80 sm:flex-1">
                  <summary className="cursor-pointer py-2 text-sm text-primary">{t("تعديل الصلاحيات")}</summary>
                  <div className="pt-2">
                    <PermissionsForm id={s.id} selected={s.permissions} />
                  </div>
                </details>
                <details className="min-w-60">
                  <summary className="cursor-pointer py-2 text-sm text-primary">{t("تغيير كلمة المرور")}</summary>
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
