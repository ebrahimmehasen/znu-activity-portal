import type { Metadata } from "next";
import { Card, PageHeader } from "@/components/ui";
import { requireUser } from "@/lib/auth/session";
import { ROLE_LABELS } from "@/lib/authz";
import { PasswordForm } from "./password-form";

export const metadata: Metadata = { title: "حسابي" };

export default async function AccountPage() {
  const user = await requireUser();
  return (
    <>
      <PageHeader title="حسابي" description={`${user.name} · ${ROLE_LABELS[user.role]} · ${user.username}`} />
      <Card className="max-w-md">
        <h2 className="mb-4 font-semibold">تغيير الباسورد</h2>
        <PasswordForm />
      </Card>
    </>
  );
}
