import type { Metadata } from "next";
import { getT } from "@/i18n/server";
import { ConfirmButton } from "@/components/confirm-button";
import { Badge, Button, Card, PageHeader } from "@/components/ui";
import { listAdmins } from "@/lib/admins/service";
import { requireAbility } from "@/lib/auth/session";
import { ROLE_LABELS } from "@/lib/authz";
import { deleteAdminAction, toggleAdminAction } from "./actions";
import { CreateAdminForm, ResetPasswordForm } from "./forms";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getT())("المسؤولون") };
}

export default async function AdminsPage() {
  const me = await requireAbility("manage_admins");
  const admins = await listAdmins();
  const t = await getT();

  return (
    <>
      <PageHeader title={t("المسؤولون")} description={t("للمسؤولين كل الصلاحيات عدا إدارة المسؤولين والإعدادات العامة.")} />

      <Card className="mb-6">
        <h2 className="mb-4 font-semibold">{t("إضافة مسؤول")}</h2>
        <CreateAdminForm />
      </Card>

      <div className="space-y-3">
        {admins.map((a) => {
          const manageable = a.role === "admin" && a.id !== me.id;
          return (
            <Card key={a.id} className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <div className="font-semibold">{a.name}</div>
                  <div className="ltr-nums text-sm text-muted">{a.username}</div>
                </div>
                <div className="flex gap-2">
                  <Badge>{t(ROLE_LABELS[a.role])}</Badge>
                  {a.isActive ? <Badge tone="success">{t("نشط")}</Badge> : <Badge tone="danger">{t("مجمَّد")}</Badge>}
                </div>
              </div>

              {manageable && (
                <div className="flex flex-wrap items-start gap-3 border-t border-border pt-3">
                  <form action={toggleAdminAction}>
                    <input type="hidden" name="id" value={a.id} />
                    <input type="hidden" name="active" value={a.isActive ? "0" : "1"} />
                    {a.isActive ? (
                      <ConfirmButton variant="secondary" message={t("تجميد {name}؟ سيُسجَّل خروجه فورًا.", { name: a.name })}>
                        {t("تجميد")}
                      </ConfirmButton>
                    ) : (
                      <Button variant="secondary">{t("إلغاء التجميد")}</Button>
                    )}
                  </form>
                  <form action={deleteAdminAction}>
                    <input type="hidden" name="id" value={a.id} />
                    <ConfirmButton variant="danger" message={t("حذف {name}؟", { name: a.name })}>
                      {t("حذف")}
                    </ConfirmButton>
                  </form>
                  <details className="min-w-60 flex-1">
                    <summary className="cursor-pointer py-2 text-sm text-primary">{t("تغيير كلمة المرور")}</summary>
                    <div className="pt-2">
                      <ResetPasswordForm id={a.id} />
                    </div>
                  </details>
                </div>
              )}
            </Card>
          );
        })}
      </div>
    </>
  );
}
