import { describe, it, expect } from "vitest";
import * as XLSX from "xlsx";
import { extractWorkdayOrdinalFromFilename, parseHaduriExcel } from "@/utils/teacherAttendanceParser";

function mockExcelFile(data: ArrayBuffer, name: string): File {
  return { name, arrayBuffer: async () => data } as File;
}

describe("example", () => {
  it("should pass", () => {
    expect(true).toBe(true);
  });
});

describe("Haduri teacher Excel parser", () => {
  it("uses summer shift 06:45-13:45 and reads Arabic/Excel time values", async () => {
    const ws = XLSX.utils.aoa_to_sheet([
      ["رقم الهوية", "اسم الموظف", "التاريخ", "وقت الحضور", "وقت الانصراف", "الحالة"],
      ["١٢٣٤٥٦٧٨٩٠", "أحمد علي", "2026-04-01", "07:00", "13:45", "حضور"],
    ]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "1");
    const data = XLSX.write(wb, { type: "array", bookType: "xlsx" });
    const result = await parseHaduriExcel(mockExcelFile(data, "01.xlsx"));

    expect(result.fileKind).toBe("attendance");
    expect(result.teachers[0].id).toBe("1234567890");
    expect(result.teachers[0].lateMin).toBe(15);
    expect(result.teachers[0].workMin).toBe(405);
    expect(result.daily[0].status).toBe("متأخر");
  });

  it("reads Haduri day files named 1.xlsx inside a monthly folder by workday order", async () => {
    const ws = XLSX.utils.aoa_to_sheet([
      ["الرقم", "اسم الموظف", "السجل المدني", "توقيت الحضور", "توقيت الانصراف", "عدد الساعات"],
      [1, "ابراهيم العجلان", 1001082179, "6:15 AM", "1:16 PM", "07:01"],
      [2, "عادل السبعان", 1003700802, "9:34 AM", "11:57 AM", "02:22"],
    ]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Sheet1");
    const data = XLSX.write(wb, { type: "array", bookType: "xlsx" });
    const fallbackDate = extractWorkdayOrdinalFromFilename("1.xlsx", 2026, 5);
    const result = await parseHaduriExcel(mockExcelFile(data, "1.xlsx"), { fallbackDate });

    expect(fallbackDate).toBe("2026-05-03");
    expect(result.importedDates).toEqual(["2026-05-03"]);
    expect(result.teachers).toHaveLength(2);
    expect(result.daily).toHaveLength(2);
  });

  it("reads period based excuse reports and classifies end-of-shift excuses", async () => {
    const ws = XLSX.utils.aoa_to_sheet([
      ["رقم الهوية", "اسم صاحب الطلب", "تاريخ الطلب", "من الساعة", "إلى الساعة", "نوع الاستئذان", "حالة الطلب"],
      ["1234567890", "أحمد علي", "2026-04-23", "12:30", "13:45", "استئذان آخر الدوام", "مقبول"],
    ]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "excuses");
    const data = XLSX.write(wb, { type: "array", bookType: "xlsx" });
    const result = await parseHaduriExcel(mockExcelFile(data, "(2026-04-01_2026-04-23)تقرير الاستئذانات.xlsx"));

    expect(result.fileKind).toBe("excuses");
    expect(result.range).toEqual({ from: "2026-04-01", to: "2026-04-23" });
    expect(result.excuses).toHaveLength(1);
    expect(result.excuses[0].period).toBe("آخر الدوام");
    expect(result.daily[0].excuse_min).toBe(75);
  });
});
