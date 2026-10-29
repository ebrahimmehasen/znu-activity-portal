import type { Metadata } from "next";
import { PageHeader } from "@/components/ui";
import { requireAbility } from "@/lib/auth/session";
import { getSettings } from "@/lib/settings/service";
import { SettingsForm } from "./settings-form";

export const metadata: Metadata = { title: "الإعدادات العامة" };

export default async function SettingsPage() {
  await requireAbility("manage_settings");
  const values = await getSettings();
  return (
    <>
      <PageHeader title="الإعدادات العامة" description="إعدادات بتطبّق على السيستم كله. كل تعديل بيتسجل في سجل العمليات." />
      <div className="max-w-2xl">
        <SettingsForm values={values} />
      </div>
    </>
  );
}
