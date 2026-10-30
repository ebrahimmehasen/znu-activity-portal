import type { Metadata } from "next";
import { getT } from "@/i18n/server";
import { Badge, Button, Card, PageHeader } from "@/components/ui";
import { requireAbility } from "@/lib/auth/session";
import { listFaculties } from "@/lib/faculties/service";
import { toggleFacultyAction } from "./actions";
import { CreateFacultyForm, RenameFacultyForm } from "./forms";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getT())("الكليات") };
}

export default async function FacultiesPage() {
  await requireAbility("manage_faculties");
  const rows = await listFaculties();
  const t = await getT();

  return (
    <>
      <PageHeader title={t("الكليات")} description={t("لا تظهر الكلية الموقوفة في نموذج الحجز، لكن تبقى بياناتها السابقة محفوظة.")} />
      <Card className="mb-6 max-w-2xl">
        <CreateFacultyForm />
      </Card>
      <div className="max-w-2xl space-y-3">
        {rows.map((f) => (
          <Card key={f.id} className="flex flex-wrap items-start gap-3">
            <RenameFacultyForm id={f.id} name={f.name} />
            <div className="flex items-center gap-2 pt-1.5">
              {f.isActive ? <Badge tone="success">{t("ظاهرة")}</Badge> : <Badge tone="danger">{t("موقوفة")}</Badge>}
              <form action={toggleFacultyAction}>
                <input type="hidden" name="id" value={f.id} />
                <input type="hidden" name="active" value={f.isActive ? "0" : "1"} />
                <Button variant="ghost" className="px-2 py-1">
                  {f.isActive ? t("إيقاف") : t("تفعيل")}
                </Button>
              </form>
            </div>
          </Card>
        ))}
      </div>
    </>
  );
}
