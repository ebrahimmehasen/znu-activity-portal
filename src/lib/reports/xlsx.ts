import ExcelJS from "exceljs";
import type { TripReport } from "./service";

const HEADER_FILL: ExcelJS.Fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE6F0EC" } };

/** Two right-to-left sheets: the summary, then the roster with one column per gathering. */
export async function reportWorkbook(r: TripReport): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "ZNU Activity Portal";
  wb.created = new Date();

  const summary = wb.addWorksheet("الملخص", { views: [{ rightToLeft: true }] });
  summary.columns = [{ width: 22 }, { width: 40 }];
  for (const [label, value] of r.summary) summary.addRow([label, value]).getCell(1).font = { bold: true };
  if (r.checkpoints.length) {
    summary.addRow([]);
    const head = summary.addRow(["التجمع", "حاضر", "متأخر", "مستني التأكيد", "لم يحضر", "غياب", "الكشف"]);
    head.font = { bold: true };
    head.eachCell((c) => (c.fill = HEADER_FILL));
    summary.getColumn(3).width = 10;
    for (const cp of r.checkpoints) {
      const t = cp.tally;
      summary.addRow([cp.time ? `${cp.name} (${cp.time})` : cp.name, t.present, t.late, t.pending, t.unrecorded, cp.first ? t.absent : "", t.total]);
    }
  }

  const roster = wb.addWorksheet("الكشف", { views: [{ rightToLeft: true, state: "frozen", ySplit: 1 }] });
  const columns: Partial<ExcelJS.Column>[] = [
    { header: "#", width: 5 },
    { header: "الاسم", width: 30 },
    { header: "الكلية", width: 28 },
    { header: "الفرقة", width: 14 },
    { header: "الهاتف", width: 14 },
    ...(r.showBus ? [{ header: "الأتوبيس", width: 14 }] : []),
    ...(r.showPaid ? [{ header: "الدفع", width: 10 }] : []),
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
