import { useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Gavel, Printer, MessageCircle, AlertTriangle, FileWarning, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { SCHOOL_INFO } from "@/types/school";
import { getHijriDate } from "@/utils/hijri";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  teacherName: string;
  teacherCivilId?: string;
  teacherInfo?: any;
}

interface DayRow {
  id: string;
  greg_date: string;
  hijri_date: string;
  day_name: string;
  in_time: string;
  late_min: number;
  absence_type: string;
}

const HOUR_THRESHOLD_DEDUCT = 7;   // كل 7 ساعات تأخر = يوم حسم
const HOUR_THRESHOLD_WARN = 4;     // التنبيه عند الاقتراب
const MOE_BANNER = "/images/moe-banner-hhh.png";

function numToArabicWords(n: number): string {
  const ones = ["","واحدة","اثنتان","ثلاث","أربع","خمس","ست","سبع","ثمان","تسع","عشر",
    "إحدى عشرة","اثنتا عشرة","ثلاث عشرة","أربع عشرة","خمس عشرة","ست عشرة",
    "سبع عشرة","ثماني عشرة","تسع عشرة","عشرون"];
  if (n <= 20) return ones[n] || String(n);
  const tens = Math.floor(n / 10) * 10;
  const rest = n % 10;
  const t: Record<number,string> = {20:"عشرون",30:"ثلاثون",40:"أربعون",50:"خمسون",60:"ستون",70:"سبعون",80:"ثمانون",90:"تسعون"};
  return rest === 0 ? (t[tens] || String(n)) : `${ones[rest]} و${t[tens] || tens}`;
}

// تحويل دقائق التأخر إلى نص عربي فصيح: "ساعتان وثلاثون دقيقة" ونحوه
function lateMinToArabicText(totalMin: number): string {
  const m = Math.max(0, Math.round(totalMin));
  if (m === 0) return "صفر";
  const h = Math.floor(m / 60);
  const rem = m % 60;
  const hourWord = (n: number) => {
    if (n === 0) return "";
    if (n === 1) return "ساعة واحدة";
    if (n === 2) return "ساعتان";
    if (n >= 3 && n <= 10) return `${numToArabicWords(n)} ساعات`;
    return `${numToArabicWords(n)} ساعة`;
  };
  const minWord = (n: number) => {
    if (n === 0) return "";
    if (n === 1) return "دقيقة واحدة";
    if (n === 2) return "دقيقتان";
    if (n >= 3 && n <= 10) return `${numToArabicWords(n)} دقائق`;
    return `${numToArabicWords(n)} دقيقة`;
  };
  const parts = [hourWord(h), minWord(rem)].filter(Boolean);
  return parts.join(" و");
}

export default function TeacherDeductionDialog({ open, onOpenChange, teacherName, teacherCivilId, teacherInfo }: Props) {
  const { profile } = useAuth();
  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState<DayRow[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [docNumber, setDocNumber] = useState<string>("01/30");

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const cid = (teacherCivilId || "").trim();
        let q = supabase
          .from("haduri_daily_records")
          .select("id,greg_date,hijri_date,day_name,in_time,late_min,absence_type,teacher_civil_id,teacher_name")
          .gt("late_min", 0)
          .order("greg_date", { ascending: false })
          .limit(500);
        q = cid ? q.eq("teacher_civil_id", cid) : q.eq("teacher_name", teacherName);
        const { data, error } = await q;
        if (error) throw error;
        if (cancelled) return;
        // استبعاد الأيام بعذر رسمي مقبول
        const acceptable = (t: string) => {
          const s = String(t || "").trim();
          return s.includes("بعذر") || s.includes("مقبول") || s.includes("رسمي");
        };
        const list: DayRow[] = (data || [])
          .filter((r: any) => !acceptable(r.absence_type))
          .map((r: any) => ({
            id: r.id,
            greg_date: r.greg_date || "",
            hijri_date: r.hijri_date || "",
            day_name: r.day_name || "",
            in_time: r.in_time || "",
            late_min: Number(r.late_min || 0),
            absence_type: r.absence_type || "",
          }));
        setRows(list);
        setSelected(new Set());
      } catch (e: any) {
        toast.error("تعذّر تحميل سجلات التأخر: " + (e?.message || "خطأ"));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [open, teacherName, teacherCivilId]);

  // إجمالي التأخر للمعلم (كل سجلاته بعد استبعاد العذر) — لتحديد الأهلية للظهور
  const totalMinAll = useMemo(() => rows.reduce((s, r) => s + r.late_min, 0), [rows]);
  const totalHoursAll = totalMinAll / 60;

  // إجمالي المُختار
  const selectedRows = useMemo(() => rows.filter((r) => selected.has(r.id)), [rows, selected]);
  const totalMinSel = useMemo(() => selectedRows.reduce((s, r) => s + r.late_min, 0), [selectedRows]);
  const totalHoursSel = totalMinSel / 60;
  const daysCount = Math.floor(totalHoursSel / HOUR_THRESHOLD_DEDUCT);

  // تحقّق التتابع: المؤشرات في rows مرتبة تصاعدياً؛ يجب أن تكون المختارة شريحة متصلة
  const consecutive = useMemo(() => {
    if (selectedRows.length === 0) return true;
    const idxs = selectedRows
      .map((r) => rows.findIndex((x) => x.id === r.id))
      .sort((a, b) => a - b);
    for (let i = 1; i < idxs.length; i++) if (idxs[i] !== idxs[i - 1] + 1) return false;
    return true;
  }, [selectedRows, rows]);

  function toggle(id: string) {
    setSelected((p) => {
      const n = new Set(p);
      if (n.has(id)) n.delete(id); else n.add(id);
      return n;
    });
  }

  function selectAll() {
    setSelected(new Set(rows.map((r) => r.id)));
  }
  function clearSel() { setSelected(new Set()); }

  async function archive(actionType: string, summary: string, payload: any) {
    try {
      const { data: u } = await supabase.auth.getUser();
      const userId = u?.user?.id ?? null;
      const actorName = profile?.full_name || "";
      await supabase.from("teacher_legacy_archive").insert({
        source: "admin_affairs",
        report_type: "قرار حسم ساعات تأخر",
        action_type: actionType,
        teacher_name: teacherName,
        teacher_civil_id: teacherCivilId || teacherInfo?.civil_id || "",
        teacher_phone: teacherInfo?.phone || "",
        greg_date: new Date().toISOString().slice(0, 10),
        hijri_date: getHijriDate(new Date()),
        summary,
        payload,
        created_by: userId,
        created_by_name: actorName,
      });
    } catch (e) { console.warn("archive", e); }
  }

  function buildDeductHTML(): string {
    const hijri = getHijriDate(new Date());
    const wholeH = Math.floor(totalHoursSel);
    const written = `${numToArabicWords(wholeH)} ساعة`;
    const civil = teacherCivilId || teacherInfo?.civil_id || "—";
    const spec = teacherInfo?.specialization || "—";
    const rank = teacherInfo?.rank_title || "—";
    const job = teacherInfo?.job_number || "—";
    const work = teacherInfo?.current_job || "معلم";
    const principal = SCHOOL_INFO.principal;
    const safeNum = (docNumber || "01/30").replace(/[<>]/g, "");
    const rowsHtml = selectedRows.map((r) => `
      <tr>
        <td>${r.hijri_date || r.greg_date}</td>
        <td>${r.day_name || "—"}</td>
        <td dir="ltr">${r.in_time || "—"}</td>
        <td>${(r.late_min / 60).toFixed(2)}</td>
        <td>${lateMinToArabicText(r.late_min)}</td>
        <td>${r.absence_type || "بدون عذر"}</td>
      </tr>`).join("");
    // ★ تنسيق موحّد للصفحات الثلاث: الموضوع (بدون خلفية) أعلى الصفحة جهة اليسار تحت الهيدر بجوار التاريخ.
    // ★ الصفحة الأولى فقط: تظهر "الرقم" و"مشفوعات: 3". الصفحتان 2 و3: التاريخ فقط.
    // ★ توقيع مدير المدرسة في الجهة اليسرى، والختم في وسط المحتوى بدون دائرة، على كل الصفحات.
    const dayName = new Date().toLocaleDateString("ar-SA-u-ca-islamic", { weekday: "long" });
    return `<!doctype html><html dir="rtl" lang="ar"><head><meta charset="utf-8"/>
<title>قرار حسم ساعات تأخر - ${teacherName}</title>
<style>
  @page { size: A4; margin: 12mm 10mm; }
  *{box-sizing:border-box;font-family:'Cairo','Tahoma','Arial',sans-serif}
  body{margin:0;color:#000;-webkit-print-color-adjust:exact;print-color-adjust:exact;font-weight:600}
  .page{padding:2mm 4mm 6mm;page-break-after:always;position:relative}
  .page:last-child{page-break-after:auto}
  /* ===== الهيدر المعتمد ===== */
  .hdr{position:relative;width:100%;margin:0 0 2mm;text-align:center}
  .hdr img{display:block;width:100%;max-height:34mm;object-fit:contain;margin:0 auto}
  .hdr .meta{position:absolute;left:2mm;top:38%;transform:translateY(-50%);
             text-align:right;direction:rtl;font-size:12px;line-height:1.7;
             color:#000;font-weight:800;background:transparent;min-width:46mm}
  .hdr .meta div{white-space:nowrap}
  .hdr .meta .mini{font-size:10.5px;font-weight:700;margin-top:1mm;color:#000}
  /* صف الموضوع تحت الهيدر — بدون خط فاصل مستقل، والخط فقط تحت الجملة */
  .subjrow{display:flex;padding:2mm 0 3mm;margin-bottom:3mm}
  .subjrow.left{justify-content:flex-start}
  .subjrow.left .subj-box{flex:1;text-align:left}
  .subject{font-weight:900;font-size:14.5px;display:inline-block;
           border-bottom:1.6px solid #000;padding-bottom:2px}
  table{width:100%;border-collapse:collapse;margin:4mm 0}
  th,td{border:1px solid #000;padding:7px 8px;font-size:13px;text-align:center;vertical-align:middle;font-weight:700;color:#000;white-space:nowrap}
  th{background:#e2e8f0;font-weight:900}
  td.name{white-space:nowrap;overflow:visible;text-overflow:clip}
  p{margin:3mm 0;font-size:13.5px;line-height:2;text-align:justify;font-weight:600;color:#000}
  .sign{margin-top:9mm;display:flex;justify-content:space-between;align-items:flex-start;gap:12px;font-size:13px}
  /* اسم المدير والتوقيع في الجهة اليسرى، الختم في الوسط، الجهة اليمنى فارغة */
  .sign .empty{order:1;flex:0 0 50mm}
  .sign .center{order:2;flex:1;text-align:center;line-height:2;font-weight:800;color:#000}
  .sign .signer{order:3;flex:0 0 70mm;text-align:right;line-height:2.1;font-weight:800;color:#000}
  .stamp{margin:3mm auto 0;font-weight:900;color:#475569;letter-spacing:2px}
  .footnote{font-size:12px;color:#000;margin-top:4mm;line-height:1.9;font-weight:600}
  .closing{font-weight:800;margin-top:5mm}
</style></head><body>

<!-- =============== الصفحة 1: خطاب الإحالة =============== -->
<section class="page">
  <div class="hdr">
    <img src="${MOE_BANNER}" alt="هيدر" onerror="this.style.display='none'"/>
    <div class="meta">
      <div>الرقم: ${safeNum}</div>
      <div>التاريخ: ${hijri}</div>
      <div>مشفوعات: 3</div>
    </div>
  </div>
  <div class="subjrow left">
    <div class="subj-box">
      <div class="subject">الموضوع: قرار حسم.</div>
    </div>
  </div>
  <p><strong>سعادة مدير عام التعليم بالمنطقة الشرقية</strong> حفظه الله</p>
  <p>السلام عليكم ورحمة الله وبركاته، وبعد:</p>
  <p>نفيد سعادتكم بأنه تم رصد مجموع ساعات التأخر الصباحي للمعلم الموضحة بياناته أدناه، حيث تجاوزت أكثر من <strong>(${HOUR_THRESHOLD_DEDUCT})</strong> ساعات، وذلك وفق ما هو موثق في سجلات الحضور والانصراف.</p>
  <p>وعليه تجدون برفقه نموذج قرار الحسم، نأمل من سعادتكم التوجيه بإكمال اللازم حيال اعتماده وفق الأنظمة والتعليمات.</p>
  <table>
    <thead><tr><th style="width:18mm">م</th><th>اسم المعلم</th><th style="width:55mm">السجل المدني</th></tr></thead>
    <tbody><tr><td>1</td><td class="name">${teacherName}</td><td>${civil}</td></tr></tbody>
  </table>
  <p class="closing">والسلام عليكم ورحمة الله وبركاته،،،</p>
  <div class="sign">
    <div class="empty"></div>
    <div class="center"><div><strong>الختم</strong></div><div class="stamp">• • •</div></div>
    <div class="signer">
      <div><strong>مدير المدرسة</strong></div>
      <div>${principal}</div>
      <div style="margin-top:6mm">التوقيع: ____________________</div>
    </div>
  </div>
</section>

<!-- =============== الصفحة 2: نموذج قرار الحسم =============== -->
<section class="page">
  <div class="hdr">
    <img src="${MOE_BANNER}" alt="هيدر" onerror="this.style.display='none'"/>
    <div class="meta">
      <div>التاريخ: ${hijri}</div>
      <div class="mini">نموذج رقم (19) — رمز النموذج: (و.م.ع.ن - 02 - 03)</div>
    </div>
  </div>
  <div class="subjrow left">
    <div class="subj-box">
      <div class="subject">اسم النموذج: قرار حسم مجموع ساعات تأخر وخروج مبكر</div>
    </div>
  </div>
  <table>
    <tr><th style="width:30mm">المدرسة</th><td colspan="4">${SCHOOL_INFO.school}</td></tr>
    <tr><th>السجل المدني</th><td colspan="4">${civil}</td></tr>
    <tr><th>الاسم</th><th>التخصص</th><th>المستوى / المرتبة</th><th>رقم الوظيفة</th><th>العمل الحالي</th></tr>
    <tr><td class="name">${teacherName}</td><td>${spec}</td><td>${rank}</td><td>${job}</td><td>${work}</td></tr>
  </table>
  <p>إن مدير المدرسة وبناءً على صلاحياته، وبناءً على المادة (21) من نظام الخدمة المدنية، وبناءً على موافقة معالي الوزير على إعطاء بعض الصلاحيات للمدارس بالقرار رقم 1/1139 وتاريخ 17/3/1431هـ، ولبلوغ ساعات التأخر عن الدوام والخروج المبكر من الدوام <strong>(${written})</strong> وحيث إن عذره غير مقبول وبمقتضى النظام.</p>
  <p><strong>يُقرر ما يلي:</strong></p>
  <p>[1] حسم مدة الغياب الموضحة بعاليه وعددها ( ${daysCount} ) يوماً من راتبه.</p>
  <p>[2] على إدارة شؤون الموظفين تنفيذ الحسم واستبعادها من خدماته وأصل القرار لملفه بالإدارة مع الأساس لملفه.</p>
  <p class="closing">والله الموفق،</p>
  <div class="sign">
    <div class="empty"></div>
    <div class="center"><div><strong>الختم</strong></div><div class="stamp">• • •</div></div>
    <div class="signer">
      <div><strong>الرئيس المباشر</strong></div>
      <div>الاسم: ${principal}</div>
      <div style="margin-top:6mm">التوقيع: ____________________</div>
      <div>التاريخ: ${hijri}</div>
    </div>
  </div>
  <div class="footnote">
    صورة / للموظفين لمتابعة تنفيذ الحسم (تنفيذ الأنظمة)<br>
    صورة / للإدارة العامة للتعليم<br>
    صورة / لملفه بالمدرسة
  </div>
</section>

<!-- =============== الصفحة 3: نموذج حصر ساعات التأخر =============== -->
<section class="page">
  <div class="hdr">
    <img src="${MOE_BANNER}" alt="هيدر" onerror="this.style.display='none'"/>
    <div class="meta">
      <div>التاريخ: ${hijri}</div>
    </div>
  </div>
  <div class="subjrow left">
    <div class="subj-box">
      <div class="subject">الموضوع: نموذج حصر ساعات التأخر للمعلم</div>
    </div>
  </div>
  <table>
    <tr><th style="width:35%">اسم المعلم</th><th>رقم الهوية</th></tr>
    <tr><td class="name">${teacherName}</td><td>${civil}</td></tr>
  </table>
  <table>
    <thead><tr><th>التاريخ (هـ)</th><th>اليوم</th><th>وقت الحضور</th><th>ساعات التأخر</th><th>ساعات التأخر كتابةً</th><th>عذر التأخير</th></tr></thead>
    <tbody>${rowsHtml || `<tr><td colspan="6">— لا توجد بيانات —</td></tr>`}</tbody>
    <tfoot><tr><th colspan="3">المجموع</th><td>${totalHoursSel.toFixed(2)} ساعة</td><td colspan="2">كتابةً: ${written}</td></tr></tfoot>
  </table>
  <div class="sign">
    <div class="empty"></div>
    <div class="center"><div><strong>الختم</strong></div><div class="stamp">• • •</div></div>
    <div class="signer">
      <div><strong>مدير المدرسة:</strong> ${principal}</div>
      <div style="margin-top:6mm">التوقيع: ____________________</div>
    </div>
  </div>
</section>

<script>setTimeout(()=>{try{window.focus();window.print();}catch(e){}}, 700);</script>
</body></html>`;
  }

  async function handlePrint() {
    if (daysCount < 1) { toast.error("لا يكفي مجموع التأخر لإصدار قرار الحسم"); return; }
    if (!consecutive) { toast.error("يجب أن تكون الأيام المختارة متتالية"); return; }
    const w = window.open("", "_blank");
    if (!w) return toast.error("النوافذ المنبثقة محظورة");
    w.document.open(); w.document.write(buildDeductHTML()); w.document.close();
    await archive("deduct", `قرار حسم ${daysCount} يوم - مجموع ${totalHoursSel.toFixed(2)} ساعة`, {
      hours: totalHoursSel, days: daysCount,
      selected_dates: selectedRows.map((r) => r.greg_date),
    });
    toast.success("تم إصدار القرار وأرشفته");
  }

  function sendWhatsApp() {
    const phone = (teacherInfo?.phone || "").replace(/\D/g, "");
    if (!phone) return toast.error("لا يوجد رقم جوال للمعلم");
    const msg = `تنبيه: بلغ مجموع ساعات تأخركم ${totalHoursAll.toFixed(2)} ساعة، وعند بلوغها ${HOUR_THRESHOLD_DEDUCT} ساعات يتم إصدار قرار حسم يوم. نأمل الالتزام بمواعيد الدوام.`;
    window.open(`https://wa.me/${phone}?text=${encodeURIComponent(msg)}`, "_blank");
    archive("warning_whatsapp", `تنبيه واتساب قبل الحسم (${totalHoursAll.toFixed(2)} ساعة)`, { hours: totalHoursAll });
  }

  function printWarningLetter() {
    const hijri = getHijriDate(new Date());
    const html = `<!doctype html><html dir="rtl" lang="ar"><head><meta charset="utf-8"/><title>خطاب تنبيه</title>
<style>@page{size:A4;margin:15mm}*{font-family:'Cairo',sans-serif;box-sizing:border-box}
.hdr{display:flex;gap:10px;margin-bottom:8mm}.hdr img{max-height:38mm;flex:1;object-fit:cover}
.meta{min-width:55mm;font-size:12px;line-height:1.7;color:#0b4a4f}
h3{text-align:center;background:#0b5e63;color:#fff;padding:6px 10px;border-radius:6px}
p{font-size:13.5px;line-height:2}.sign{margin-top:14mm;font-size:12.5px}
</style></head><body>
<div class="hdr"><img src="${MOE_BANNER}" onerror="this.style.display='none'"/>
<div class="meta"><div>الرقم: 01/30</div><div>التاريخ: ${hijri}</div><div>الموضوع: تنبيه قبل الحسم</div></div></div>
<h3>خطاب تنبيه قبل بلوغ حد الحسم</h3>
<p>المكرم/ ${teacherName}    السجل المدني: ${teacherCivilId || "—"}</p>
<p>السلام عليكم ورحمة الله وبركاته، وبعد:</p>
<p>نحيطكم علماً بأنه بلغ مجموع ساعات تأخركم الصباحي المسجلة في منصة (حضوري) <strong>(${totalHoursAll.toFixed(2)})</strong> ساعة،
وعند بلوغها (${HOUR_THRESHOLD_DEDUCT}) ساعات بدون عذر رسمي مقبول يتم إصدار قرار حسم يوم من الراتب وفق الأنظمة.</p>
<p>نأمل منكم الحرص على الالتزام بمواعيد الدوام تفادياً لإصدار قرار الحسم. ولكم خالص الشكر والتقدير.</p>
<div class="sign"><div><strong>مدير المدرسة</strong></div><div>${SCHOOL_INFO.principal}</div><div style="margin-top:10mm">التوقيع: ____________________</div></div>
<script>setTimeout(()=>{try{window.focus();window.print();}catch(e){}},500);</script>
</body></html>`;
    const w = window.open("", "_blank");
    if (!w) return toast.error("النوافذ المنبثقة محظورة");
    w.document.open(); w.document.write(html); w.document.close();
    archive("warning_letter", `خطاب تنبيه قبل الحسم (${totalHoursAll.toFixed(2)} ساعة)`, { hours: totalHoursAll });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl max-h-[92vh] overflow-y-auto" dir="rtl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-xl">
            <Gavel className="w-5 h-5 text-primary" />
            قرار حسم مجموع ساعات تأخر — {teacherName}
          </DialogTitle>
          <DialogDescription>
            اختر الأيام المتتالية للمعلم. كل (7) ساعات تأخر بدون عذر مقبول = يوم حسم.
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-10 text-muted-foreground">
            <Loader2 className="w-5 h-5 animate-spin ml-2" /> جاري التحميل…
          </div>
        ) : (
          <div className="space-y-4">
            {totalHoursAll < HOUR_THRESHOLD_WARN ? (
              <Alert>
                <AlertTriangle className="h-4 w-4" />
                <AlertTitle>لم يصل إلى حد التنبيه</AlertTitle>
                <AlertDescription>
                  مجموع تأخر المعلم {totalHoursAll.toFixed(2)} ساعة. لا يظهر في إجراء الحسم إلا عند اقترابه من ({HOUR_THRESHOLD_WARN}) ساعات.
                </AlertDescription>
              </Alert>
            ) : totalHoursAll < HOUR_THRESHOLD_DEDUCT ? (
              <Alert className="border-amber-500/40 bg-amber-50 dark:bg-amber-950/20">
                <FileWarning className="h-4 w-4 text-amber-600" />
                <AlertTitle className="text-amber-700">تنبيه قبل الحسم</AlertTitle>
                <AlertDescription>
                  بلغ مجموع التأخر {totalHoursAll.toFixed(2)} ساعة (الحد {HOUR_THRESHOLD_DEDUCT}). يجب تنبيه المعلم قبل إصدار قرار الحسم.
                  <div className="flex gap-2 mt-3">
                    <Button size="sm" variant="outline" onClick={sendWhatsApp} className="gap-1.5">
                      <MessageCircle className="w-4 h-4" /> تنبيه واتساب
                    </Button>
                    <Button size="sm" variant="outline" onClick={printWarningLetter} className="gap-1.5">
                      <Printer className="w-4 h-4" /> خطاب تنبيه
                    </Button>
                  </div>
                </AlertDescription>
              </Alert>
            ) : null}

            <Card className="p-3">
              <div className="flex flex-wrap items-center gap-2 mb-3">
                <Badge variant="outline">إجمالي تأخر المعلم: {totalHoursAll.toFixed(2)} ساعة</Badge>
                <Badge variant="secondary">المختار: {totalHoursSel.toFixed(2)} ساعة</Badge>
                <Badge className={daysCount >= 1 ? "bg-destructive" : ""}>أيام الحسم المحسوبة: {daysCount}</Badge>
                {!consecutive && <Badge variant="destructive">الأيام المختارة غير متتالية</Badge>}
                <div className="ms-auto flex items-center gap-2">
                  <label className="text-xs text-muted-foreground whitespace-nowrap">رقم القرار (الصفحة 1):</label>
                  <Input value={docNumber} onChange={(e) => setDocNumber(e.target.value)} className="h-8 w-28 text-center font-mono" />
                  <Button size="sm" variant="outline" onClick={selectAll} disabled={!rows.length}>تحديد الكل</Button>
                  <Button size="sm" variant="ghost" onClick={clearSel} disabled={!selected.size}>إلغاء</Button>
                </div>
              </div>
              <div className="overflow-auto max-h-[45vh] border rounded-md">
                <table className="w-full text-sm">
                  <thead className="bg-muted sticky top-0">
                    <tr>
                      <th className="p-2 w-10"></th>
                      <th className="p-2 text-right">التاريخ (هـ)</th>
                      <th className="p-2 text-right">اليوم</th>
                      <th className="p-2">وقت الحضور</th>
                      <th className="p-2">دقائق التأخر</th>
                      <th className="p-2 text-right">العذر</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => (
                      <tr key={r.id} className="border-t hover:bg-muted/50">
                        <td className="p-2 text-center">
                          <Checkbox checked={selected.has(r.id)} onCheckedChange={() => toggle(r.id)} />
                        </td>
                        <td className="p-2">{r.hijri_date || r.greg_date}</td>
                        <td className="p-2">{r.day_name || "—"}</td>
                        <td className="p-2 text-center font-mono" dir="ltr">{r.in_time || "—"}</td>
                        <td className="p-2 text-center font-mono">{r.late_min}</td>
                        <td className="p-2">{r.absence_type || "بدون عذر"}</td>
                      </tr>
                    ))}
                    {rows.length === 0 && (
                      <tr><td colSpan={6} className="p-6 text-center text-muted-foreground">لا توجد أيام تأخر بدون عذر مقبول</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </Card>

            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => onOpenChange(false)}>إغلاق</Button>
              <Button onClick={handlePrint} disabled={daysCount < 1 || !consecutive} className="gap-1.5">
                <Printer className="w-4 h-4" /> طباعة وأرشفة القرار ({daysCount} يوم)
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
