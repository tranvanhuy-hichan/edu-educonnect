import ExcelJS from "exceljs";

export type ExcelSlot = { dayOfWeek: number; periodNo: number; subject: string; className: string; teacher: string; room: string };
export type ExcelSheet = {
  name: string;
  title: string;
  /** "class": ô ghi Môn/Giáo viên/Phòng; "teacher": ô ghi Môn/Lớp/Phòng. */
  mode: "class" | "teacher";
  slots: ExcelSlot[];
};

const DAY_LABEL: Record<number, string> = { 2: "Thứ 2", 3: "Thứ 3", 4: "Thứ 4", 5: "Thứ 5", 6: "Thứ 6", 7: "Thứ 7" };
const safeName = (s: string) => s.replace(/[\\/?*[\]:]/g, " ").trim().slice(0, 31) || "Sheet";

/** Tạo file .xlsx thời khóa biểu: hàng = tiết 1–10, cột = Thứ 2–7, mỗi sheet một lớp hoặc một giáo viên. */
export async function timetableWorkbook(sheets: ExcelSheet[]): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "EduConnect";
  const used = new Set<string>();
  for (const sh of sheets) {
    let name = safeName(sh.name);
    for (let i = 2; used.has(name); i++) name = `${safeName(sh.name).slice(0, 28)} ${i}`;
    used.add(name);
    const ws = wb.addWorksheet(name, { views: [{ state: "frozen", xSplit: 1, ySplit: 2 }] });

    ws.mergeCells(1, 1, 1, 7);
    const title = ws.getCell(1, 1);
    title.value = sh.title;
    title.font = { bold: true, size: 14 };
    title.alignment = { horizontal: "center", vertical: "middle" };
    ws.getRow(1).height = 26;

    const head = ws.getRow(2);
    head.values = ["Tiết", ...Object.values(DAY_LABEL)];
    head.eachCell((c) => {
      c.font = { bold: true };
      c.alignment = { horizontal: "center", vertical: "middle" };
      c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFEDE9FE" } };
    });

    const byCell = new Map<string, ExcelSlot[]>();
    for (const s of sh.slots) byCell.set(`${s.dayOfWeek}|${s.periodNo}`, [...(byCell.get(`${s.dayOfWeek}|${s.periodNo}`) ?? []), s]);
    for (let p = 1; p <= 10; p++) {
      const row = ws.getRow(p + 2);
      row.getCell(1).value = `Tiết ${p}`;
      row.getCell(1).font = { bold: true };
      for (let d = 2; d <= 7; d++) {
        const items = byCell.get(`${d}|${p}`) ?? [];
        row.getCell(d).value = items
          .map((s) => (sh.mode === "class" ? [s.subject, s.teacher, s.room] : [s.subject, s.className, s.room]).filter(Boolean).join("\n"))
          .join("\n---\n");
      }
      row.height = 48;
    }
    ws.getColumn(1).width = 9;
    for (let d = 2; d <= 7; d++) ws.getColumn(d).width = 22;
    ws.eachRow((row, n) => {
      if (n < 2) return;
      row.eachCell((c, col) => {
        c.border = { top: { style: "thin" }, left: { style: "thin" }, bottom: { style: "thin" }, right: { style: "thin" } };
        if (n > 2 && col !== 1) c.alignment = { wrapText: true, vertical: "middle", horizontal: "center" };
      });
    });
  }
  return Buffer.from(await wb.xlsx.writeBuffer());
}
