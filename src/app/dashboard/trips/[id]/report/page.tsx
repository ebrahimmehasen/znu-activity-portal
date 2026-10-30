import type { Metadata } from "next";
import { getI18n, getT } from "@/i18n/server";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Logo } from "@/components/logo";
import { Card } from "@/components/ui";
import { can } from "@/lib/authz";
import { tripReport } from "@/lib/reports/service";
import { requireVisibleTrip } from "@/lib/trips/access";
import { PrintButton } from "./print-button";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getT())("تقرير الرحلة") };
}

const th = "border border-border bg-background px-2 py-1.5 text-start font-semibold";
const td = "border border-border px-2 py-1.5";

/** The report on screen and in print: "طباعة / PDF" opens the browser's print dialog (Save as PDF). */
export default async function TripReportPage({ params }: PageProps<"/dashboard/trips/[id]/report">) {
  const { actor, trip } = await requireVisibleTrip((await params).id);
  if (!can(actor, "manage_activities")) notFound();
  const { locale, t } = await getI18n();
  const r = await tripReport(actor, trip, locale);

  return (
    <div className="space-y-4 print:space-y-3 print:text-[11px]">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <Logo size={56} />
          <div>
            <h1 className="text-xl font-bold">{t("تقرير: {trip}", { trip: trip.title })}</h1>
            <p className="text-sm text-muted">
              {t("جامعة الزقازيق الأهلية")} · {t("بوابة الأنشطة")}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2 print:hidden">
          <a href={`/dashboard/trips/${trip.id}/report/xlsx`} className="rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground">
            {t("تنزيل ملف Excel")}
          </a>
          <PrintButton />
          <Link href={`/dashboard/trips/${trip.id}`} className="rounded-lg border border-border bg-surface px-4 py-2.5 text-sm font-semibold">
            {t("الرحلة")}
          </Link>
        </div>
      </div>

      <Card className="print:border-0 print:p-0 print:shadow-none">
        <h2 className="mb-2 font-semibold">{t("الملخص")}</h2>
        <dl className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm sm:grid-cols-4 print:grid-cols-4">
          {r.summary.map(([label, value]) => (
            <div key={label}>
              <dt className="text-xs text-muted">{label}</dt>
              <dd className="font-medium">{value}</dd>
            </div>
          ))}
        </dl>
      </Card>

      {r.checkpoints.length > 0 && (
        <Card className="overflow-x-auto print:overflow-visible print:border-0 print:p-0 print:shadow-none">
          <h2 className="mb-2 font-semibold">{t("التجمعات")}</h2>
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr>
                {[t("التجمع"), t("حاضر"), t("متأخر"), t("بانتظار التأكيد"), t("لم يحضر"), t("غائب"), t("الكشف")].map((h) => (
                  <th key={h} className={th}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {r.checkpoints.map((cp) => (
                <tr key={cp.name}>
                  <td className={td}>
                    {cp.name} {cp.time && <span className="text-muted">({cp.time})</span>}
                  </td>
                  <td className={td}>{cp.tally.present}</td>
                  <td className={td}>{cp.tally.late}</td>
                  <td className={td}>{cp.tally.pending}</td>
                  <td className={td}>{cp.tally.unrecorded}</td>
                  <td className={td}>{cp.first ? cp.tally.absent : "—"}</td>
                  <td className={td}>{cp.tally.total}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      <Card className="overflow-x-auto print:overflow-visible print:border-0 print:p-0 print:shadow-none">
        <h2 className="mb-2 font-semibold">{t("الكشف ({n})", { n: r.rows.length })}</h2>
        {r.rows.length === 0 ? (
          <p className="text-sm text-muted">{t("لا توجد حجوزات مؤكدة.")}</p>
        ) : (
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr>
                <th className={th}>#</th>
                <th className={th}>{t("الاسم")}</th>
                <th className={th}>{t("الكلية")}</th>
                <th className={th}>{t("الفرقة")}</th>
                <th className={th}>{t("الهاتف")}</th>
                {r.showBus && <th className={th}>{t("الحافلة")}</th>}
                {r.showPaid && <th className={th}>{t("الدفع")}</th>}
                {r.checkpoints.map((cp) => (
                  <th key={cp.name} className={th}>
                    {cp.name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {r.rows.map((row) => (
                <tr key={row.n} className="break-inside-avoid">
                  <td className={td}>{row.n}</td>
                  <td className={`${td} whitespace-nowrap`}>{row.name}</td>
                  <td className={td}>{row.faculty}</td>
                  <td className={`${td} whitespace-nowrap`}>{row.year}</td>
                  <td className={td}>
                    <a href={`tel:${row.phone}`} className="ltr-nums text-primary print:text-foreground" dir="ltr">
                      {row.phone}
                    </a>
                  </td>
                  {r.showBus && <td className={td}>{row.bus}</td>}
                  {r.showPaid && <td className={td}>{row.paid}</td>}
                  {row.cells.map((c, i) => (
                    <td key={i} className={`${td} whitespace-nowrap`}>
                      {c}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  );
}
