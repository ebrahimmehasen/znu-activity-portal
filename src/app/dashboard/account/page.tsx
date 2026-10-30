import type { Metadata } from "next";
import { getT } from "@/i18n/server";
import { Card, PageHeader } from "@/components/ui";
import { requireUser } from "@/lib/auth/session";
import { ROLE_LABELS } from "@/lib/authz";
import { PasswordForm } from "./password-form";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getT())("حسابي") };
}

export default async function AccountPage() {
  const user = await requireUser();
  const t = await getT();
  return (
    <>
      <PageHeader title={t("حسابي")} description={`${user.name} · ${t(ROLE_LABELS[user.role])} · ${user.username}`} />
      <Card className="max-w-md">
        <h2 className="mb-4 font-semibold">{t("تغيير كلمة المرور")}</h2>
        <PasswordForm />
      </Card>
    </>
  );
}
