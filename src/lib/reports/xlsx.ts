import ExcelJS from "exceljs";
import { makeT } from "@/i18n/translate";
import type { TripReport } from "./service";

const HEADER_FILL: ExcelJS.Fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE6F0EC" } };

/** Two sheets (right-to-left in Arabic): the summary, then the roster with one column per gathering. */
export async function reportWorkbook(r: TripReport): Promise<Buffer> {
  const t = makeT(r.locale);
  const rightToLeft = r.locale === "ar";
  const wb = new ExcelJS.Workbook();
  wb.creator = "ZNU Activity Portal";
  wb.created = new Date();

  const summary = wb.addWorksheet(t("الملخص"), { views: [{ rightToLeft }] });
  summary.columns = [{ width: 22 }, { width: 40 }];
  for (const [label, value] of r.summary) summary.addRow([label, value]).getCell(1).font = { bold: true };
  if (r.checkpoints.length) {
    summary.addRow([]);
    const head = summary.addRow([t("التجمع"), t("حاضر"), t("متأخر"), t("بانتظار التأكيد"), t("لم يحضر"), t("غائب"), t("الكشف")]);
    head.font = { bold: true };
    head.eachCell((c) => (c.fill = HEADER_FILL));
    summary.getColumn(3).width = 10;
    for (const cp of r.checkpoints) {
      const tl = cp.tally;
      summary.addRow([cp.time ? `${cp.name} (${cp.time})` : cp.name, tl.present, tl.late, tl.pending, tl.unrecorded, cp.first ? tl.absent : "", tl.total]);
    }
  }

  const roster = wb.addWorksheet(t("الكشف"), { views: [{ rightToLeft, state: "frozen", ySplit: 1 }] });
  const columns: Partial<ExcelJS.Column>[] = [
    { header: "#", width: 5 },
    { header: t("الاسم"), width: 30 },
    { header: t("الكلية"), width: 28 },
    { header: t("الفرقة"), width: 14 },
    { header: t("الهاتف"), width: 14 },
    ...(r.showBus ? [{ header: t("الحافلة"), width: 14 }] : []),
    ...(r.showPaid ? [{ header: t("الدفع"), width: 10 }] : []),
    ...r.checkpoints.map((cp) => ({ header: cp.name, width: 18 })),
  ];
  roster.columns = columns;
  const head = roster.getRow(1);
  head.font = { bold: true };
  head.eachCell((c) => (c.fill = HEADER_FILL));
  for (const row of r.rows) {
    // Every value is a plain string or number, so nothing is ever read as a formula.
    roster.addRow([
      row.n,
      row.name,
      row.faculty,
      row.year,
      row.phone,
      ...(r.showBus ? [row.bus] : []),
      ...(r.showPaid ? [row.paid] : []),
      ...row.cells,
    ]);
  }
  // Keep the leading zero of phone numbers.
  roster.getColumn(5).numFmt = "@";

  return Buffer.from(await wb.xlsx.writeBuffer());
}
