import type { Metadata } from "next";
import { getI18n, getT } from "@/i18n/server";
import { PurgeForm } from "@/components/purge-form";
import { Button, Card, Input, PageHeader } from "@/components/ui";
import { requireAbility } from "@/lib/auth/session";
import { can } from "@/lib/authz";
import { STUDENT_PURGE_WORDS, searchStudents } from "@/lib/purge/service";
import { YEAR_LABELS, maskNationalId } from "@/lib/students/validation";
import { purgeStudentAction } from "../purge-actions";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getT())("الطلاب") };
}

/** Find a student to wipe their data (plan §8). Students are added through bookings only. */
export default async function StudentsPage({ searchParams }: PageProps<"/dashboard/students">) {
  const actor = await requireAbility("manage_activities");
  const raw = (await searchParams).q;
  const q = typeof raw === "string" ? raw.slice(0, 100) : "";
  const results = q ? await searchStudents(actor, q) : [];
  const fullNid = can(actor, "see_national_id");
  const { locale, t } = await getI18n();
  const word = STUDENT_PURGE_WORDS[locale];

  return (
    <>
      <PageHeader title={t("الطلاب")} description={t("ابحث عن طالب بالاسم أو الهاتف أو الرقم القومي. تبقى البيانات محفوظة حتى تحذفها.")} />

      <Card className="mb-4">
        <form className="flex gap-2" role="search">
          <Input name="q" defaultValue={q} minLength={3} required placeholder={t("الاسم أو الهاتف أو الرقم القومي")} aria-label={t("بحث")} />
          <Button type="submit">{t("بحث")}</Button>
        </form>
      </Card>

      {q && q.trim().length < 3 ? (
        <Card className="text-sm text-muted">{t("اكتب 3 أحرف أو أرقام على الأقل.")}</Card>
      ) : q && results.length === 0 ? (
        <Card className="py-8 text-center text-muted">{t("لا توجد نتائج.")}</Card>
      ) : (
        <div className="space-y-3">
          {results.map((s) => (
            <Card key={s.id}>
              <div className="font-semibold">{s.name}</div>
              <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted">
                <span>
                  {s.facultyName} · {t(YEAR_LABELS[s.year])}
                </span>
                <a href={`tel:${s.phone}`} className="ltr-nums text-primary" dir="ltr">
                  {s.phone}
                </a>
                <span className="ltr-nums" dir="ltr">
                  {fullNid ? s.nationalId : maskNationalId(s.nationalId)}
                </span>
                <span>{t("{n} حجز", { n: s.bookings })}</span>
              </div>
              <details className="mt-3">
                <summary className="cursor-pointer text-sm font-medium text-danger">{t("حذف بيانات الطالب")}</summary>
                <div className="mt-2 rounded-lg border border-danger/30 bg-danger/5 p-3">
                  <p className="mb-2 text-sm">{t("سيُحذف الطالب وكل حجوزاته وتسجيلات حضوره نهائيًا. لا يمكن ذلك إذا كان له حجز في رحلة لم تنتهِ.")}</p>
                  <PurgeForm
                    action={purgeStudentAction}
                    id={s.id}
                    expected={word}
                    prompt={t("اكتب «{word}» للتأكيد", { word })}
                    confirmMessage={t("حذف بيانات {name} نهائيًا؟ لا يمكن التراجع.", { name: s.name })}
                  />
                </div>
              </details>
            </Card>
          ))}
        </div>
      )}
    </>
  );
}
