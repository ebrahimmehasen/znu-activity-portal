import type { Metadata } from "next";
import { ConfirmButton } from "@/components/confirm-button";
import { Badge, Button, Card, PageHeader } from "@/components/ui";
import { listAdmins } from "@/lib/admins/service";
import { requireAbility } from "@/lib/auth/session";
import { ROLE_LABELS } from "@/lib/authz";
import { deleteAdminAction, toggleAdminAction } from "./actions";
import { CreateAdminForm, ResetPasswordForm } from "./forms";

export const metadata: Metadata = { title: "الأدمنز" };

export default async function AdminsPage() {
  const me = await requireAbility("manage_admins");
  const admins = await listAdmins();

  return (
    <>
      <PageHeader title="الأدمنز" description="الأدمنز ليهم كل الصلاحيات ما عدا إدارة الأدمنز والإعدادات العامة." />

      <Card className="mb-6">
        <h2 className="mb-4 font-semibold">إضافة أدمن</h2>
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
                  <Badge>{ROLE_LABELS[a.role]}</Badge>
                  {a.isActive ? <Badge tone="success">نشط</Badge> : <Badge tone="danger">مجمّد</Badge>}
                </div>
              </div>

              {manageable && (
                <div className="flex flex-wrap items-start gap-3 border-t border-border pt-3">
                  <form action={toggleAdminAction}>
                    <input type="hidden" name="id" value={a.id} />
                    <input type="hidden" name="active" value={a.isActive ? "0" : "1"} />
                    {a.isActive ? (
                      <ConfirmButton variant="secondary" message={`تجميد ${a.name}؟ هيتعمله خروج فورًا.`}>
                        تجميد
                      </ConfirmButton>
                    ) : (
                      <Button variant="secondary">إلغاء التجميد</Button>
                    )}
                  </form>
                  <form action={deleteAdminAction}>
                    <input type="hidden" name="id" value={a.id} />
                    <ConfirmButton variant="danger" message={`حذف ${a.name}؟`}>
                      حذف
                    </ConfirmButton>
                  </form>
                  <details className="min-w-60 flex-1">
                    <summary className="cursor-pointer py-2 text-sm text-primary">تغيير الباسورد</summary>
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
