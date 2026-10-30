import type { Metadata } from "next";
import { PurgeForm } from "@/components/purge-form";
import { Button, Card, Input, PageHeader } from "@/components/ui";
import { requireAbility } from "@/lib/auth/session";
import { can } from "@/lib/authz";
import { STUDENT_PURGE_WORD, searchStudents } from "@/lib/purge/service";
import { YEAR_LABELS, maskNationalId } from "@/lib/students/validation";
import { purgeStudentAction } from "../purge-actions";

export const metadata: Metadata = { title: "الطلبة" };

/** Find a student to wipe their data (plan §8). Students are added through bookings only. */
export default async function StudentsPage({ searchParams }: PageProps<"/dashboard/students">) {
  const actor = await requireAbility("manage_activities");
  const raw = (await searchParams).q;
  const q = typeof raw === "string" ? raw.slice(0, 100) : "";
  const results = q ? await searchStudents(actor, q) : [];
  const fullNid = can(actor, "see_national_id");

  return (
    <>
      <PageHeader title="الطلبة" description="دوّر على طالب بالاسم أو الهاتف أو الرقم القومي. البيانات بتفضل محفوظة لحد ما تمسحها." />

      <Card className="mb-4">
        <form className="flex gap-2" role="search">
          <Input name="q" defaultValue={q} minLength={3} required placeholder="الاسم أو الهاتف أو الرقم القومي" aria-label="بحث" />
          <Button type="submit">بحث</Button>
        </form>
      </Card>

      {q && q.trim().length < 3 ? (
        <Card className="text-sm text-muted">اكتب 3 حروف أو أرقام على الأقل.</Card>
      ) : q && results.length === 0 ? (
        <Card className="py-8 text-center text-muted">مفيش نتايج.</Card>
      ) : (
        <div className="space-y-3">
          {results.map((s) => (
            <Card key={s.id}>
              <div className="font-semibold">{s.name}</div>
              <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted">
                <span>
                  {s.facultyName} · {YEAR_LABELS[s.year]}
                </span>
                <a href={`tel:${s.phone}`} className="ltr-nums text-primary" dir="ltr">
                  {s.phone}
                </a>
                <span className="ltr-nums" dir="ltr">
                  {fullNid ? s.nationalId : maskNationalId(s.nationalId)}
                </span>
                <span>{s.bookings} حجز</span>
              </div>
              <details className="mt-3">
                <summary className="cursor-pointer text-sm font-medium text-danger">مسح بيانات الطالب</summary>
                <div className="mt-2 rounded-lg border border-danger/30 bg-danger/5 p-3">
                  <p className="mb-2 text-sm">هيتمسح الطالب وكل حجوزاته وتسجيلات حضوره نهائيًا. مينفعش لو عنده حجز في رحلة لسه مخلصتش.</p>
                  <PurgeForm
                    action={purgeStudentAction}
                    id={s.id}
                    expected={STUDENT_PURGE_WORD}
                    prompt={`اكتب "${STUDENT_PURGE_WORD}" للتأكيد`}
                    confirmMessage={`مسح بيانات ${s.name} نهائيًا؟ مفيش رجوع.`}
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
