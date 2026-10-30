import type { Metadata } from "next";
import { getT } from "@/i18n/server";
import { PageHeader } from "@/components/ui";
import { requireAbility } from "@/lib/auth/session";
import { getSettings } from "@/lib/settings/service";
import { SettingsForm } from "./settings-form";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getT())("الإعدادات العامة") };
}

export default async function SettingsPage() {
  await requireAbility("manage_settings");
  const values = await getSettings();
  const t = await getT();
  return (
    <>
      <PageHeader title={t("الإعدادات العامة")} description={t("إعدادات تُطبَّق على النظام كله، ويُسجَّل كل تعديل في سجل العمليات.")} />
      <div className="max-w-2xl">
        <SettingsForm values={values} />
      </div>
    </>
  );
}
