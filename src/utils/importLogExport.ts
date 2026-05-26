import * as XLSX from "xlsx";
import type { SheetReport, FileNamePattern } from "./teacherAttendanceParser";

export type FileImportEntry = {
  fileName: string;
  status: "نجح" | "نجح جزئيًا" | "فشل" | "متجاهل";
  fileKind: "حضور" | "استئذان" | "—";
  pattern: FileNamePattern | "—";
  detectedDate: string;
  acceptedRows: number;
  failureReason?: string;
  sheetReports?: SheetReport[];
};

export type ImportLogPayload = {
  folderName?: string;
  totalFiles: number;
  excelFiles: number;
  readFiles: number;
  attendanceRows: number;
  excuseRows: number;
  validAttendanceDates: string[];
  skippedAttendanceDates: string[];
  unmatchedTeachers: string[];
  files: FileImportEntry[];
};

function patternToArabic(p: FileNamePattern | "—"): string {
  if (p === "full_date") return "تاريخ كامل في الاسم";
  if (p === "day_ordinal") return "رقم يوم فقط";
  if (p === "date_range") return "فترة تاريخية";
  if (p === "unknown") return "غير محدد";
  return "—";
}

export function downloadImportLogExcel(payload: ImportLogPayload, fileName = "سجل_الاستيراد.xlsx") {
  const wb = XLSX.utils.book_new();

  // Sheet 1: ملخص الملفات
  const filesAoa: any[][] = [
    ["الملف", "الحالة", "النوع", "نمط الاسم", "التاريخ المكتشف", "الصفوف المقبولة", "السبب / الملاحظة"],
    ...payload.files.map((f) => [
      f.fileName,
      f.status,
      f.fileKind,
      patternToArabic(f.pattern),
      f.detectedDate,
      f.acceptedRows,
      f.failureReason || "",
    ]),
  ];
  const wsFiles = XLSX.utils.aoa_to_sheet(filesAoa);
  wsFiles["!cols"] = [{ wch: 40 }, { wch: 12 }, { wch: 10 }, { wch: 22 }, { wch: 26 }, { wch: 12 }, { wch: 60 }];
  XLSX.utils.book_append_sheet(wb, wsFiles, "ملخص الملفات");

  // Sheet 2: تشخيص الأوراق
  const sheetAoa: any[][] = [["الملف", "الورقة", "تم التعرف؟", "صف الترويسة", "الترويسات المكتشفة", "صفوف ممسوحة", "صفوف مقبولة", "التاريخ", "الملاحظة"]];
  for (const f of payload.files) {
    for (const sr of f.sheetReports || []) {
      sheetAoa.push([
        f.fileName, sr.sheetName, sr.recognized ? "نعم" : "لا",
        sr.headerRow + 1, (sr.detectedHeaders || []).join(" | "),
        sr.rowsScanned, sr.rowsAccepted, sr.detectedDate, sr.reason,
      ]);
    }
  }
  const wsSheets = XLSX.utils.aoa_to_sheet(sheetAoa);
  wsSheets["!cols"] = [{ wch: 36 }, { wch: 18 }, { wch: 12 }, { wch: 12 }, { wch: 60 }, { wch: 14 }, { wch: 14 }, { wch: 22 }, { wch: 60 }];
  XLSX.utils.book_append_sheet(wb, wsSheets, "تشخيص الأوراق");

  // Sheet 3: المعلمون غير المطابقين
  const teachersAoa: any[][] = [["معلمون لم تتم مطابقتهم بسجل المعلمين"]];
  for (const t of payload.unmatchedTeachers) teachersAoa.push([t]);
  const wsTeachers = XLSX.utils.aoa_to_sheet(teachersAoa);
  wsTeachers["!cols"] = [{ wch: 80 }];
  XLSX.utils.book_append_sheet(wb, wsTeachers, "معلمون غير مطابقين");

  // Sheet 4: التواريخ
  const datesAoa: any[][] = [["تواريخ معتمدة", "تواريخ مستبعدة"]];
  const max = Math.max(payload.validAttendanceDates.length, payload.skippedAttendanceDates.length);
  for (let i = 0; i < max; i++) {
    datesAoa.push([payload.validAttendanceDates[i] || "", payload.skippedAttendanceDates[i] || ""]);
  }
  const wsDates = XLSX.utils.aoa_to_sheet(datesAoa);
  wsDates["!cols"] = [{ wch: 18 }, { wch: 18 }];
  XLSX.utils.book_append_sheet(wb, wsDates, "التواريخ");

  // Sheet 5: ملخص عام
  const summaryAoa: any[][] = [
    ["البند", "القيمة"],
    ["المجلد", payload.folderName || "—"],
    ["إجمالي الملفات المرفوعة", payload.totalFiles],
    ["ملفات Excel/CSV", payload.excelFiles],
    ["ملفات قُرئت", payload.readFiles],
    ["إجمالي صفوف الحضور", payload.attendanceRows],
    ["إجمالي صفوف الاستئذان", payload.excuseRows],
    ["أيام حضور معتمدة", payload.validAttendanceDates.length],
    ["أيام مستبعدة", payload.skippedAttendanceDates.length],
    ["معلمون غير مطابقين", payload.unmatchedTeachers.length],
  ];
  const wsSummary = XLSX.utils.aoa_to_sheet(summaryAoa);
  wsSummary["!cols"] = [{ wch: 32 }, { wch: 20 }];
  XLSX.utils.book_append_sheet(wb, wsSummary, "ملخص عام");

  XLSX.writeFile(wb, fileName);
}
