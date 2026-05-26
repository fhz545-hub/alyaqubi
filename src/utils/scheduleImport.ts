import * as XLSX from "xlsx";
// Use the browser-specific build to avoid pulling Node-only deps via Vite.
// Loaded lazily so we don't crash when the user uploads an HTML-flavoured .doc
// (which is not a real OOXML zip and therefore breaks mammoth at parse time).
type MammothLike = { convertToHtml: (input: { arrayBuffer: ArrayBuffer }) => Promise<{ value: string }> };

export const SCHEDULE_DAYS = ["الأحد", "الإثنين", "الثلاثاء", "الأربعاء", "الخميس"] as const;
export const SCHEDULE_PERIODS = [1, 2, 3, 4, 5, 6, 7] as const;

export type ScheduleCell = { subject: string; section: string };
export type ScheduleGrid = Record<string, Record<string, ScheduleCell>>;

export interface ParsedTeacherSchedule {
  /** Raw label as read from the source (could be short like "عبدالسهلي"). */
  rawName: string;
  /** Section-major files already contain the exact teacher display names per cell; do not fuzzy-match them. */
  exactTeacherNames?: boolean;
  /** Optional civil id read alongside the schedule (10 digits). */
  civilId?: string;
  /** Optional job number read alongside the schedule. */
  jobNumber?: string;
  /** Optional subject/specialization label. */
  subject?: string;
  grid: ScheduleGrid;
}

export interface TeacherCandidate {
  id: string;
  full_name: string;
  civil_id?: string;
  job_number?: string;
}

/* ============================================================
 *                Smart Arabic name matching
 * ============================================================ */

const STOP_WORDS = new Set([
  "بن","بنت","ابن","عبد","ال","آل","أبو","ابو","الأستاذ","الاستاذ","استاذ","معلم","المعلم","أ",
]);

function normalizeArabic(s: string): string {
  return (s || "")
    .replace(/[\u064B-\u065F\u0670\u06D6-\u06ED]/g, "") // tashkeel
    .replace(/[إأآا]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ؤ/g, "و")
    .replace(/ئ/g, "ي")
    .replace(/ة/g, "ه")
    .replace(/[^\u0600-\u06FF\sA-Za-z0-9]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokens(s: string): string[] {
  return normalizeArabic(s)
    .split(" ")
    .map((t) => t.replace(/^ال/, ""))
    .filter((t) => t && !STOP_WORDS.has(t));
}

/**
 * Matches a raw (possibly abbreviated) name against a list of teachers.
 * Strategy:
 *  1) Civil id / job number exact match (highest confidence).
 *  2) Score = how many tokens of the short name appear (as prefix or full)
 *     inside the full teacher name. Requires unique best score above
 *     threshold to avoid confusing similar names ("عبدالسهلي" vs another
 *     "السهلي").
 */
export function matchTeacher(
  raw: ParsedTeacherSchedule,
  teachers: TeacherCandidate[],
): { teacher: TeacherCandidate | null; confidence: "id" | "high" | "low" | "none"; alternatives: TeacherCandidate[] } {
  if (raw.civilId) {
    const cid = raw.civilId.replace(/\D/g, "");
    if (cid.length === 10) {
      const hit = teachers.find((t) => (t.civil_id || "").replace(/\D/g, "") === cid);
      if (hit) return { teacher: hit, confidence: "id", alternatives: [] };
    }
  }
  if (raw.jobNumber) {
    const jn = raw.jobNumber.replace(/\s+/g, "");
    if (jn.length >= 3) {
      const hit = teachers.find((t) => (t.job_number || "").replace(/\s+/g, "") === jn);
      if (hit) return { teacher: hit, confidence: "id", alternatives: [] };
    }
  }

  const shortTokens = tokens(raw.rawName);
  if (shortTokens.length === 0) return { teacher: null, confidence: "none", alternatives: [] };

  const scored = teachers.map((t) => {
    const fullTokens = tokens(t.full_name);
    let hits = 0;
    for (const st of shortTokens) {
      // a short token matches if any full token starts with it (covers prefixes
      // like "عبد" matching "عبدالله") OR if it appears as substring (covers
      // glued forms like "عبدالسهلي" containing "السهلي").
      const ok = fullTokens.some(
        (ft) => ft === st || ft.startsWith(st) || st.startsWith(ft) || ft.includes(st) || st.includes(ft),
      );
      if (ok) hits++;
    }
    const ratio = hits / shortTokens.length;
    return { t, hits, ratio, fullLen: fullTokens.length };
  });

  scored.sort((a, b) => b.hits - a.hits || b.ratio - a.ratio);
  const top = scored[0];
  if (!top || top.hits === 0) return { teacher: null, confidence: "none", alternatives: [] };

  const ties = scored.filter((s) => s.hits === top.hits && s.ratio === top.ratio);
  if (ties.length > 1) {
    return {
      teacher: null,
      confidence: "low",
      alternatives: ties.slice(0, 5).map((s) => s.t),
    };
  }

  // High confidence requires either matching all short tokens, or at least 2
  // tokens with a high ratio.
  const high = top.ratio >= 0.99 || (top.hits >= 2 && top.ratio >= 0.6);
  return {
    teacher: high ? top.t : null,
    confidence: high ? "high" : "low",
    alternatives: high ? [] : scored.slice(0, 5).map((s) => s.t),
  };
}

/* ============================================================
 *                Cell text → ScheduleCell
 * ============================================================ */

export function parseScheduleCell(raw: string): ScheduleCell {
  const original = (raw || "").toString();
  // Multi-line cells from the school template: "اول خامس\nعلم البيئة" => section first, subject second.
  const lines = original
    .split(/\r?\n|<br\s*\/?>(?=)/i)
    .map((l) => l.trim())
    .filter(Boolean);
  if (lines.length === 0) return { subject: "", section: "" };
  if (lines.length === 1) {
    const v = lines[0].replace(/\s+/g, " ").trim();
    if (!v || v === "-" || v === "—" || v === "/") return { subject: "", section: "" };
    const parts = v.split(/\s*[-–|/]\s*/);
    if (parts.length >= 2) {
      return { subject: parts[0].trim(), section: parts.slice(1).join(" ").trim() };
    }
    // "منتظر 1" / "احتياط" etc. → keep whole text as subject so it isn't lost.
    if (/^(منتظر|احتياط|انتظار|إشراف|اشراف|ريادة)/.test(v)) {
      return { subject: v, section: "" };
    }
    const m = v.match(/^(.*?)[\s]+([0-9]+[\s\/\-]*[0-9]*)\s*$/);
    if (m) return { subject: m[1].trim(), section: m[2].trim() };
    return { subject: v, section: "" };
  }
  // Two (or more) physical lines: section line(s) then subject as the LAST line.
  const subject = lines[lines.length - 1].replace(/\s+/g, " ").trim();
  const section = lines.slice(0, -1).join(" ").replace(/\s+/g, " ").trim();
  return { subject, section };
}

function isDayHeader(s: string): (typeof SCHEDULE_DAYS)[number] | null {
  const n = normalizeArabic(s);
  if (!n) return null;
  // Map every common spelling/abbreviation back to the canonical day label.
  const map: Array<[RegExp, (typeof SCHEDULE_DAYS)[number]]> = [
    [/(^|\s)احد(\s|$)|الاحد/, "الأحد"],
    [/(^|\s)اثنين(\s|$)|الاثنين|الإثنين/, "الإثنين"],
    [/(^|\s)ثلاثاء(\s|$)|الثلاثاء/, "الثلاثاء"],
    [/(^|\s)اربعاء(\s|$)|الاربعاء|الأربعاء/, "الأربعاء"],
    [/(^|\s)خميس(\s|$)|الخميس/, "الخميس"],
  ];
  for (const [re, day] of map) if (re.test(n)) return day;
  return null;
}

function looksLikeSectionLabel(s: string): boolean {
  const n = normalizeArabic(s).replace(/\s+/g, " ").trim();
  if (!n || /^[0-9\s]+$/.test(n) || /^[-–—_=\s]+$/.test(n)) return false;
  return /^(اول|ثاني|ثالث)\s+(اول|ثاني|ثالث|رابع|خامس|سادس|سابع)$/.test(n);
}

function toAsciiDigits(s: string): string {
  return String(s || "").replace(/[٠-٩۰-۹]/g, (d) => String("٠١٢٣٤٥٦٧٨٩۰۱۲۳۴۵۶۷۸۹".indexOf(d) % 10));
}

function periodNumberFromCell(value: unknown): number | null {
  const n = parseInt(toAsciiDigits(String(value ?? "")).replace(/[^0-9]/g, ""), 10);
  return n >= 1 && n <= 7 ? n : null;
}

function buildDayPeriodBlocks(
  dayCol: Record<number, (typeof SCHEDULE_DAYS)[number]>,
  periodRow: string[],
): Array<{ day: (typeof SCHEDULE_DAYS)[number]; periods: Array<{ period: number; col: number }> }> {
  const starts = Object.entries(dayCol)
    .map(([c, day]) => ({ start: parseInt(c, 10), day }))
    .sort((a, b) => a.start - b.start);

  return starts.map((block, idx) => {
    const nextStart = starts[idx + 1]?.start ?? periodRow.length;
    const periods: Array<{ period: number; col: number }> = [];
    for (let c = block.start; c < nextStart; c++) {
      const period = periodNumberFromCell(periodRow[c]);
      if (period && !periods.some((p) => p.period === period)) periods.push({ period, col: c });
    }
    if (periods.length === 0) {
      for (let off = 0; off < SCHEDULE_PERIODS.length; off++) periods.push({ period: SCHEDULE_PERIODS[off], col: block.start + off });
    }
    return { day: block.day, periods };
  });
}

function gridFromMatrix(matrix: string[][]): ScheduleGrid | null {
  // Find rows that begin with a day name; columns 1..7 are periods.
  const grid: ScheduleGrid = {};
  let found = 0;
  for (const row of matrix) {
    if (!row || row.length === 0) continue;
    const dayCell = row.find((c) => c && isDayHeader(String(c)));
    if (!dayCell) continue;
    const day = isDayHeader(String(dayCell))!;
    const dayIdx = row.indexOf(dayCell);
    const dayMap: Record<string, ScheduleCell> = {};
    for (let p = 0; p < SCHEDULE_PERIODS.length; p++) {
      const cell = row[dayIdx + 1 + p] || "";
      dayMap[SCHEDULE_PERIODS[p]] = parseScheduleCell(String(cell));
    }
    grid[day] = dayMap;
    found++;
  }
  return found >= 3 ? grid : null;
}

/* ============================================================
 * School-wide Excel: ONE sheet, one teacher per ROW, columns are
 * day×period blocks. Layout used by the user's template:
 *   row 1: school title
 *   row 2: "#" | "المعلم" | الأحد(merged 7) | الاثنين(7) | ... | "الفصول"
 *   row 3:               | 1 .. 7 | 1 .. 7 | ...                |  total
 *   row 4+: teacher rows
 * ============================================================ */

function parseSchoolWideExcelMatrix(matrix: string[][]): ParsedTeacherSchedule[] {
  // Locate the header row that contains both a teacher column and a day name.
  let headerRow = -1;
  let nameCol = -1;
  // Map of column index -> day label, built from the header row.
  const dayCol: Record<number, (typeof SCHEDULE_DAYS)[number]> = {};

  for (let r = 0; r < Math.min(matrix.length, 8); r++) {
    const row = matrix[r] || [];
    let foundDays = 0;
    let nc = -1;
    const localDayCol: Record<number, (typeof SCHEDULE_DAYS)[number]> = {};
    for (let c = 0; c < row.length; c++) {
      const cell = String(row[c] || "").trim();
      if (!cell) continue;
      const day = isDayHeader(cell);
      if (day) { localDayCol[c] = day; foundDays++; continue; }
      if (/^(المعلم|اسم\s*المعلم|اسم\s*المدرس)$/.test(cell.replace(/\s+/g, " "))) {
        nc = c;
      }
    }
    if (foundDays >= 4 && nc >= 0) {
      headerRow = r;
      nameCol = nc;
      Object.assign(dayCol, localDayCol);
      break;
    }
  }
  if (headerRow < 0) return [];

  // Order the day columns so we know each day's 7-period block start.
  const dayBlocks = Object.entries(dayCol)
    .map(([c, d]) => ({ start: parseInt(c, 10), day: d }))
    .sort((a, b) => a.start - b.start);

  // Sub-header row (period numbers) usually sits right under the day row.
  const out: ParsedTeacherSchedule[] = [];
  for (let r = headerRow + 2; r < matrix.length; r++) {
    const row = matrix[r] || [];
    const rawName = String(row[nameCol] || "").trim();
    if (!rawName) continue;
    // Skip totals/footer rows that don't look like a name.
    if (/^(المجموع|الإجمالي|الاجمالي|total)/i.test(rawName)) continue;
    if (/^[0-9\s]+$/.test(rawName)) continue;

    const grid: ScheduleGrid = {};
    for (const { start, day } of dayBlocks) {
      const dayMap: Record<string, ScheduleCell> = {};
      for (let p = 0; p < SCHEDULE_PERIODS.length; p++) {
        const cell = row[start + p];
        dayMap[SCHEDULE_PERIODS[p]] = parseScheduleCell(String(cell ?? ""));
      }
      grid[day] = dayMap;
    }
    // Drop teachers whose row has zero real content (avoid empty placeholders).
    const hasContent = Object.values(grid).some((d) =>
      Object.values(d).some((c) => c.subject.trim() || c.section.trim()),
    );
    if (!hasContent) continue;
    out.push({ rawName, grid });
  }
  return out;
}

/* ============================================================
 * School-wide Excel "Smart Table" layout: ONE sheet, one SECTION per ROW,
 * columns are day×period blocks (each day spans 7 period columns).
 * Each cell looks like: "<subject>\n<teacher>".
 *
 *   row 1: title
 *   row 2: "الفصل / الحصة" | الأحد(7) | الاثنين(7) | الثلاثاء(7) | الأربعاء(7) | الخميس(7)
 *   row 3:                  | 1..7    | 1..7      | 1..7        | 1..7       | 1..7
 *   row 4+: <section name>  | <subj\nteacher cells…>
 *
 * We invert it into one ParsedTeacherSchedule per teacher.
 * ============================================================ */
function parseSectionMajorExcelMatrix(matrix: string[][]): ParsedTeacherSchedule[] {
  let headerRow = -1;
  let sectionCol = -1;
  const dayCol: Record<number, (typeof SCHEDULE_DAYS)[number]> = {};

  for (let r = 0; r < Math.min(matrix.length, 8); r++) {
    const row = matrix[r] || [];
    const localDayCol: Record<number, (typeof SCHEDULE_DAYS)[number]> = {};
    let foundDays = 0;
    let sc = -1;
    for (let c = 0; c < row.length; c++) {
      const cell = String(row[c] || "").trim();
      if (!cell) continue;
      const day = isDayHeader(cell);
      if (day) { localDayCol[c] = day; foundDays++; continue; }
      if (/(الفصل|الشعبة|الصف).*(الحصة|الحصص)|^الفصل\s*\/\s*الحصة$/.test(cell.replace(/\s+/g, " "))) {
        sc = c;
      }
    }
    if (foundDays >= 4) {
      headerRow = r;
      // Section column defaults to the first column if not explicitly labeled.
      sectionCol = sc >= 0 ? sc : 0;
      Object.assign(dayCol, localDayCol);
      break;
    }
  }
  if (headerRow < 0) return [];

  const firstDataRow = headerRow + 2;
  const dataRows = matrix.slice(firstDataRow).filter((row) => row?.some((c) => String(c || "").trim()));
  const sectionRows = dataRows.filter((row) => looksLikeSectionLabel(String(row[sectionCol] || ""))).length;
  if (sectionRows < 3 || sectionRows < Math.ceil(dataRows.length * 0.6)) return [];

  const periodRow = matrix[headerRow + 1] || [];
  const dayBlocks = buildDayPeriodBlocks(dayCol, periodRow);

  // Helper: split a single-cell value like "<subject> / <teacher>" or
  // "<subject>\n<teacher>" or "<subject> - <teacher>" into the two parts.
  // If the cell contains only one value, treat it as the TEACHER name because
  // the latest official section-major file intentionally omits subjects.
  const splitSubjectTeacher = (raw: string): { subject: string; teacher: string } | null => {
    const v = raw.replace(/\s+/g, " ").trim();
    if (!v) return null;
    if (/^[-—_=\s]+$/.test(v)) return null; // "----------" etc.
    // Try newline first, then " / ", " - ", " | ", " ، ".
    let parts = raw.split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
    if (parts.length < 2) parts = v.split(/\s*\/\s*/);
    if (parts.length < 2) parts = v.split(/\s+[-–—|]\s+/);
    if (parts.length < 2) return { subject: "", teacher: v };
    const subject = parts[0].trim();
    const teacher = parts.slice(1).join(" ").replace(/\s+/g, " ").trim();
    return { subject, teacher };
  };

  // Map: teacher rawName -> day -> period -> { subject, section }
  const byTeacher = new Map<string, ScheduleGrid>();

  // Data rows start two rows under the day header (skip the period-numbers row).
  for (let r = headerRow + 2; r < matrix.length; r++) {
    const row = matrix[r] || [];
    const sectionLabel = String(row[sectionCol] || "").trim();
    if (!sectionLabel) continue;
    if (!looksLikeSectionLabel(sectionLabel)) continue;
    if (/^(المجموع|الإجمالي|الاجمالي|total)/i.test(sectionLabel)) continue;
    // Skip pure-numeric / separator rows.
    if (/^[-_=\s]+$/.test(sectionLabel)) continue;

    for (const { day, periods } of dayBlocks) {
      for (const { period, col } of periods) {
        const raw = String(row[col] ?? "").trim();
        if (!raw) continue;
        const split = splitSubjectTeacher(raw);
        if (!split) continue;
        const { subject, teacher } = split;
        if (!teacher) continue; // no teacher → can't map to a schedule entry

        let g = byTeacher.get(teacher);
        if (!g) {
          g = {};
          for (const d of SCHEDULE_DAYS) {
            g[d] = {};
            for (const pp of SCHEDULE_PERIODS) g[d][String(pp)] = { subject: "", section: "" };
          }
          byTeacher.set(teacher, g);
        }
        g[day][String(period)] = { subject, section: sectionLabel };
      }
    }
  }

  const out: ParsedTeacherSchedule[] = [];
  for (const [teacher, grid] of byTeacher) {
    out.push({ rawName: teacher, exactTeacherNames: true, grid });
  }
  return out;
}

/* ============================================================
 *                Excel (single + school-wide)
 * ============================================================ */

function findTeacherLabel(matrix: string[][]): { name: string; civilId?: string; jobNumber?: string; subject?: string } {
  const out: { name: string; civilId?: string; jobNumber?: string; subject?: string } = { name: "" };
  for (const row of matrix) {
    for (const c of row) {
      const s = String(c || "").trim();
      if (!s) continue;
      if (/(اسم\s*المعلم|اسم\s*المدرس|المعلم\s*[:|/])/.test(s)) {
        // value is in next non-empty cell on same row
        const idx = row.indexOf(c);
        const next = row.slice(idx + 1).find((x) => String(x || "").trim());
        if (next) out.name = String(next).trim();
      }
      if (/السجل\s*المدني|رقم\s*الهوية|الهوية/.test(s)) {
        const idx = row.indexOf(c);
        const next = row.slice(idx + 1).find((x) => String(x || "").trim());
        if (next) out.civilId = String(next).replace(/\D/g, "");
      }
      if (/الرقم\s*الوظيفي|رقم\s*الوظيف/.test(s)) {
        const idx = row.indexOf(c);
        const next = row.slice(idx + 1).find((x) => String(x || "").trim());
        if (next) out.jobNumber = String(next).trim();
      }
      if (/التخصص|المادة\s*الأساسية/.test(s)) {
        const idx = row.indexOf(c);
        const next = row.slice(idx + 1).find((x) => String(x || "").trim());
        if (next) out.subject = String(next).trim();
      }
    }
  }
  return out;
}

/**
 * Parse a single teacher's grid from either tab/CSV text or a worksheet.
 */
export function parseSingleScheduleText(text: string): ScheduleGrid | null {
  const matrix = text
    .split(/\r?\n/)
    .map((l) => l.split(/\t|,|;|\|/).map((c) => c.trim()));
  return gridFromMatrix(matrix);
}

/**
 * Parse an Excel workbook. If it is school-wide, every sheet is treated as one
 * teacher (sheet name fallback for the teacher name); we also look for the
 * "اسم المعلم" / "السجل المدني" labels inside the sheet.
 * If the workbook contains a single teacher on the first sheet, we still
 * return an array with one entry.
 */
export async function parseExcelFile(file: File): Promise<ParsedTeacherSchedule[]> {
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: "array" });
  const out: ParsedTeacherSchedule[] = [];
  // First pass: section-major "Smart Table" layout (one row per SECTION, each
  // cell holding "subject\nteacher"). Detected by a day-header row whose data
  // rows start with section labels.
  for (const sheetName of wb.SheetNames) {
    const ws = wb.Sheets[sheetName];
    const matrix: string[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "", blankrows: false }) as any;
    const sectionMajor = parseSectionMajorExcelMatrix(matrix);
    if (sectionMajor.length > 0) out.push(...sectionMajor);
  }
  if (out.length > 0) return out;
  // Second pass: school-wide one-row-per-teacher layout.
  for (const sheetName of wb.SheetNames) {
    const ws = wb.Sheets[sheetName];
    const matrix: string[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "", blankrows: false }) as any;
    const wide = parseSchoolWideExcelMatrix(matrix);
    if (wide.length > 0) out.push(...wide);
  }
  if (out.length > 0) return out;
  // Fallback: per-sheet single-teacher layout.
  for (const sheetName of wb.SheetNames) {
    const ws = wb.Sheets[sheetName];
    const matrix: string[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "", blankrows: false }) as any;
    const grid = gridFromMatrix(matrix);
    if (!grid) continue;
    const labels = findTeacherLabel(matrix);
    const rawName = labels.name || sheetName.trim();
    if (!rawName) continue;
    out.push({
      rawName,
      civilId: labels.civilId,
      jobNumber: labels.jobNumber,
      subject: labels.subject,
      grid,
    });
  }
  return out;
}

/* ============================================================
 *                Word (.docx)
 * ============================================================ */

/**
 * Convert a docx file to HTML, then walk every <table> looking for a 5×8 grid
 * shaped like (day | p1..p7). Each table is treated as one teacher; we look
 * above the table for the nearest non-empty paragraph as the teacher name.
 */
export async function parseDocxFile(file: File): Promise<ParsedTeacherSchedule[]> {
  const buf = await file.arrayBuffer();

  // Word can save a "Web Page" file with a .doc/.docx extension that is
  // actually HTML, not OOXML. Sniff the first bytes and route accordingly.
  const head = new Uint8Array(buf.slice(0, 8));
  const isZip = head[0] === 0x50 && head[1] === 0x4b; // "PK"

  let html: string;
  if (isZip) {
    const mammoth = (await import("mammoth/mammoth.browser")).default as MammothLike;
    const res = await mammoth.convertToHtml({ arrayBuffer: buf });
    html = res.value;
  } else {
    // Decode as UTF-8 first; fall back to windows-1256 for legacy Arabic .doc HTML.
    const decoded = new TextDecoder("utf-8", { fatal: false }).decode(buf);
    html = decoded;
    if (!/<\s*table/i.test(decoded)) {
      try {
        html = new TextDecoder("windows-1256" as any).decode(buf);
      } catch {
        /* keep utf-8 fallback */
      }
    }
    if (!/<\s*(html|table|div|body)/i.test(html)) {
      throw new Error("صيغة الملف غير مدعومة. الرجاء رفع ملف Word (.docx) أو حفظ الملف كـ HTML.");
    }
  }

  const doc = new DOMParser().parseFromString(html, "text/html");
  const out: ParsedTeacherSchedule[] = [];

  // Preferred path: the school's "الجدول الذكي" template marks each teacher as
  // <div class="table-page" data-teacher-id="…"> with <span id="name-teacherN">.
  const teacherCards = Array.from(doc.querySelectorAll("[data-teacher-id], .table-page, .table-container"));
  if (teacherCards.length > 0) {
    for (const card of teacherCards) {
      const nameEl = card.querySelector('[id^="name-teacher"], .teacher-name span, .teacher-name');
      const headerText = (card.textContent || "").slice(0, 600);
      let rawName = (nameEl?.textContent || "").trim();
      if (!rawName) {
        const m = headerText.match(/جدول\s*المعلم\s*[:\-]?\s*([^\n\r|]+)/);
        if (m) rawName = m[1].trim();
      }
      // Strip honorific prefixes (some templates render the title text inside
      // the same node as the name): "جدول المعلم فلان" → "فلان".
      rawName = rawName
        .replace(/^\s*(?:جدول\s*المعلم|اسم\s*المعلم|المعلم|الأستاذ|الاستاذ)\s*[:\-]?\s*/u, "")
        .trim();
      if (!rawName) continue;
      const table = card.querySelector("table");
      if (!table) continue;
      const grid = gridFromHtmlTable(table);
      if (!grid) continue;
      const cidMatch = headerText.match(/(\d{10})/);
      const jobMatch = headerText.match(/الرقم\s*الوظيفي\s*[:\-]?\s*([0-9]{3,})/);
      out.push({
        rawName,
        civilId: cidMatch?.[1],
        jobNumber: jobMatch?.[1],
        grid,
      });
    }
    if (out.length > 0) return out;
  }

  // Generic fallback: scan every <table>, look upwards for the teacher name.
  const tables = Array.from(doc.querySelectorAll("table"));
  for (const table of tables) {
    const grid = gridFromHtmlTable(table);
    if (!grid) continue;
    let rawName = "";
    let prev: Element | null = table.previousElementSibling;
    const collected: string[] = [];
    let safety = 8;
    while (prev && safety-- > 0) {
      const t = (prev.textContent || "").trim();
      if (t) collected.push(t);
      prev = prev.previousElementSibling;
    }
    const header = collected.reverse().join(" | ");
    const nameMatch = header.match(/(?:جدول\s*المعلم|اسم\s*المعلم|المعلم|الأستاذ|الاستاذ)\s*[:\-/]?\s*([^|]+)/);
    rawName = (nameMatch?.[1] || collected[0] || "").trim();
    if (!rawName) continue;
    const cidMatch = header.match(/(\d{10})/);
    const jobMatch = header.match(/الرقم\s*الوظيفي\s*[:\-]?\s*([0-9]{3,})/);
    out.push({ rawName, civilId: cidMatch?.[1], jobNumber: jobMatch?.[1], grid });
  }
  return out;
}

/** Build a ScheduleGrid from a real DOM <table>, preserving line breaks. */
function gridFromHtmlTable(table: Element): ScheduleGrid | null {
  const rows = Array.from(table.querySelectorAll("tr")).map((tr) =>
    Array.from(tr.querySelectorAll("th,td")).map((td) => {
      // Replace <br> with newlines so parseScheduleCell can split section/subject.
      const html = (td.innerHTML || "").replace(/<br\s*\/?>(?=)/gi, "\n");
      const tmp = document.createElement("div");
      tmp.innerHTML = html;
      return (tmp.textContent || "").replace(/\u00a0/g, " ").trim();
    }),
  );
  return gridFromMatrix(rows);
}

/* ============================================================
 *                Bulk persistence helpers
 * ============================================================ */

export function settingsKeyFor(name: string, civilId?: string): string {
  const id = (civilId || "").trim();
  return `teacher_profile:${id || `name:${name.trim()}`}`;
}

export function mergeIntoExtras(
  existing: any | null | undefined,
  grid: ScheduleGrid,
): any {
  const base = existing && typeof existing === "object" ? existing : {};
  return {
    subjects: Array.isArray(base.subjects) ? base.subjects : [],
    sections: Array.isArray(base.sections) ? base.sections : [],
    notes: typeof base.notes === "string" ? base.notes : "",
    ...base,
    schedule: grid,
  };
}