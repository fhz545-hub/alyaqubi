import React, { useState, useEffect, useMemo, useCallback } from "react";
import AppLayout from "@/components/AppLayout";
import { supabase } from "@/integrations/supabase/client";
import { loadStudents, getStudentsFromDB } from "@/store/studentsStore";
import { Student } from "@/types/school";
import { Award, Star, Users, Search, Printer, ChevronDown, ChevronUp, Trophy, Medal, Sparkles, FileText, MessageCircle, TrendingUp } from "lucide-react";
import { GRADE_CODE_MAP } from "@/utils/gradeNames";
import { useAuth } from "@/contexts/AuthContext";
import { getHijriYear, getFullHijriDate } from "@/utils/hijri";
import { openWhatsApp, isValidSaudiPhone } from "@/utils/whatsapp";
import { toast } from "@/hooks/use-toast";
import { ImprovementTrackTab } from "@/components/ImprovementTrackTab";
import { filterRegularStudents } from "@/utils/distanceLearning";
import { OutstandingClassesSection } from "@/components/DailyReportTopIndicators";

interface PositiveStudent extends Student {
  score: number;
  badges: string[];
}

const POSITIVE_CRITERIA = [
  { label: "عدم ارتكاب أي مخالفة سلوكية خلال الفصل الدراسي", points: 80, type: "سلوك إيجابي" },
  { label: "انضباط الطالب وعدم غيابه بدون عذر خلال الفصل الدراسي", points: 3, type: "سلوك إيجابي" },
  { label: "المحافظة على الهوية الوطنية (اللباس والمظهر العام، الالتزام بقيم الولاء والانتماء)", points: 3, type: "سلوك مميز" },
  { label: "المشاركة في المبادرات والأعمال التطوعية داخل المدرسة", points: 3, type: "سلوك مميز" },
  { label: "المشاركة في الإذاعة والأنشطة المدرسية", points: 3, type: "سلوك مميز" },
  { label: "المحافظة على ممتلكات المدرسة", points: 2, type: "سلوك مميز" },
  { label: "التعاون مع الزملاء والمعلمين وإدارة المدرسة", points: 2, type: "سلوك مميز" },
  { label: "الالتحاق ببرامج ودورات في مجال التطوير الشخصي", points: 2, type: "سلوك مميز" },
  { label: "تقديم المقترحات التطويرية لصالح المجتمع المدرسي", points: 2, type: "سلوك مميز" },
];

const PositiveBehaviorPage = () => {
  const { profile } = useAuth();
  const canIssueCertificate = profile?.is_principal || profile?.role_title === "وكيل";
  const [activeTab, setActiveTab] = useState<"distinguished" | "improvement" | "classes">("distinguished");
  const [loading, setLoading] = useState(true);
  const [positiveStudents, setPositiveStudents] = useState<PositiveStudent[]>([]);
  const [search, setSearch] = useState("");
  const [selectedGrade, setSelectedGrade] = useState<string>("all");
  const [expandedGrade, setExpandedGrade] = useState<string | null>(null);

  const refreshPositiveStudents = useCallback(async () => {
    setLoading(true);
    await loadStudents(true);
    // استبعاد طلاب التعليم الإلكتروني (انتساب) نهائياً من قائمة السلوك الإيجابي
    const allStudents = filterRegularStudents(getStudentsFromDB());
    const pageSize = 1000;
    const negativeTypes = ["absent", "late", "violation", "class_late", "class_escape", "class_chaos", "no_homework", "sleeping", "class_note"];
    const negCounts: Record<string, number> = {};

    for (let from = 0; ; from += pageSize) {
      const { data, error } = await supabase
        .from("student_actions")
        .select("student_id, type")
        .in("type", negativeTypes)
        .range(from, from + pageSize - 1);

      if (error) {
        console.error("Failed to load positive behavior data:", error);
        break;
      }

      if (!data || data.length === 0) break;
      for (const row of data) {
        negCounts[row.student_id] = (negCounts[row.student_id] || 0) + 1;
      }
      if (data.length < pageSize) break;
    }

    const clean = allStudents.filter((s) => !negCounts[s.id] || negCounts[s.id] === 0);
    const positive: PositiveStudent[] = clean.map((s) => ({ ...s, score: 100, badges: ["سلوك إيجابي", "انضباط كامل"] }));
    positive.sort((a, b) => a.gradeCode.localeCompare(b.gradeCode) || a.section - b.section || a.name.localeCompare(b.name, "ar"));
    setPositiveStudents(positive);
    setLoading(false);
  }, []);

  useEffect(() => {
    refreshPositiveStudents();
  }, [refreshPositiveStudents]);

  useEffect(() => {
    const channel = supabase
      .channel("positive-behavior-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "student_actions" }, () => refreshPositiveStudents())
      .on("postgres_changes", { event: "*", schema: "public", table: "students" }, () => refreshPositiveStudents())
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [refreshPositiveStudents]);

  const grades = useMemo(() => {
    const codes = [...new Set(positiveStudents.map(s => s.gradeCode))];
    return codes.map(c => ({ code: c, name: GRADE_CODE_MAP[c] || c }));
  }, [positiveStudents]);

  const filtered = useMemo(() => {
    let list = positiveStudents;
    if (selectedGrade !== "all") list = list.filter(s => s.gradeCode === selectedGrade);
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter(s => s.name.includes(q) || s.studentNumber.includes(q));
    }
    return list;
  }, [positiveStudents, selectedGrade, search]);

  const groupedByGrade = useMemo(() => {
    const map: Record<string, PositiveStudent[]> = {};
    for (const s of filtered) {
      const key = s.gradeCode;
      if (!map[key]) map[key] = [];
      map[key].push(s);
    }
    return map;
  }, [filtered]);

  // الإحصاءات والنسب تُحسب فقط على الطلاب المنتظمين
  const totalStudents = filterRegularStudents(getStudentsFromDB()).length;
  const positiveRate = totalStudents > 0 ? Math.round((positiveStudents.length / totalStudents) * 100) : 0;

  const printList = () => {
    const rows = filtered.map((s, i) => `
      <tr>
        <td style="padding:6px 10px;border:1px solid #ddd;text-align:center">${i + 1}</td>
        <td style="padding:6px 10px;border:1px solid #ddd;text-align:right">${s.name}</td>
        <td style="padding:6px 10px;border:1px solid #ddd;text-align:center">${s.grade}</td>
        <td style="padding:6px 10px;border:1px solid #ddd;text-align:center">${s.section}</td>
        <td style="padding:6px 10px;border:1px solid #ddd;text-align:center">${s.score}</td>
        <td style="padding:6px 10px;border:1px solid #ddd;text-align:center">${s.badges.join("، ")}</td>
      </tr>
    `).join("");

    const html = `<!DOCTYPE html><html dir="rtl"><head><meta charset="utf-8"><title>كشف السلوك الإيجابي</title>
    <style>body{font-family:Arial,sans-serif;padding:30px}table{width:100%;border-collapse:collapse;margin-top:20px}th{background:#1a5276;color:#fff;padding:8px 10px;border:1px solid #ddd;font-size:12px}td{font-size:11px}h1{text-align:center;color:#1a5276;font-size:18px}h2{text-align:center;color:#555;font-size:14px;margin-top:5px}.header{text-align:center;margin-bottom:20px}.stats{display:flex;justify-content:center;gap:40px;margin:15px 0;font-size:13px}.stat{text-align:center}.stat b{display:block;font-size:20px;color:#1a5276}@media print{body{padding:15px}}</style></head><body>
    <div class="header">
      <p style="font-size:12px;color:#888">المملكة العربية السعودية - وزارة التعليم</p>
      <h1>برنامج تعزيز السلوك الإيجابي</h1>
      <h2>كشف الطلاب المتميزين سلوكياً</h2>
    </div>
    <div class="stats">
      <div class="stat"><b>${positiveStudents.length}</b>طالب متميز</div>
      <div class="stat"><b>${positiveRate}%</b>نسبة التميز</div>
      <div class="stat"><b>${totalStudents}</b>إجمالي الطلاب</div>
    </div>
    <table><thead><tr><th>م</th><th>اسم الطالب</th><th>الصف</th><th>الشعبة</th><th>الدرجة</th><th>التصنيف</th></tr></thead><tbody>${rows}</tbody></table>
    <div style="margin-top:40px;display:flex;justify-content:space-between;gap:20px;font-size:12px;color:#333">
      <div style="flex:1;text-align:center">
        <div style="font-weight:700;color:#1a5276;margin-bottom:6px">الموجه الطلابي</div>
        <div style="font-weight:600">عادل علي السبعان</div>
        <div style="margin-top:18px;border-top:1px solid #999;padding-top:4px;color:#888">التوقيع</div>
      </div>
      <div style="flex:1;text-align:center">
        <div style="font-weight:700;color:#1a5276;margin-bottom:6px">وكيل شؤون الطلاب</div>
        <div style="font-weight:600">عدنان علي الزريق</div>
        <div style="margin-top:18px;border-top:1px solid #999;padding-top:4px;color:#888">التوقيع</div>
      </div>
      <div style="flex:1;text-align:center">
        <div style="font-weight:700;color:#1a5276;margin-bottom:6px">مدير المدرسة</div>
        <div style="font-weight:600">فهد حامد الزهراني</div>
        <div style="margin-top:18px;border-top:1px solid #999;padding-top:4px;color:#888">التوقيع</div>
      </div>
    </div>
    </body></html>`;
    const w = window.open("", "_blank");
    if (w) { w.document.write(html); w.document.close(); w.print(); }
  };

  const sendWhatsAppCongrats = (student: PositiveStudent) => {
    const allStudents = getStudentsFromDB();
    const fullStudent = allStudents.find(s => s.id === student.id);
    const phone = fullStudent?.guardianPhone || student.guardianPhone;
    if (!isValidSaudiPhone(phone)) {
      toast({ title: "رقم ولي الأمر غير صالح", variant: "destructive" });
      return;
    }
    const msg = `السلام عليكم ورحمة الله وبركاته\n\nولي أمر الطالب / ${student.name}\n\nيسرّ إدارة مدرسة اليعقوبي الثانوية أن تزفّ لكم بشرى تميّز ابنكم في الانضباط المدرسي والسلوك الإيجابي خلال هذا الفصل الدراسي.\n\nلقد أظهر ابنكم التزاماً تاماً بالحضور والانصراف، وتميّزاً في سلوكه داخل المدرسة، مما يعكس حرصكم الكريم على متابعته وتوجيهه.\n\nنسأل الله أن يبارك فيه ويوفقه لما يحب ويرضى.\n\nمع خالص التقدير والاحترام\nإدارة مدرسة اليعقوبي الثانوية`;
    const sent = openWhatsApp(phone, msg);
    if (sent) toast({ title: "تم فتح واتساب لإرسال رسالة تحفيزية لولي الأمر" });
  };

  const printCertificate = (student: PositiveStudent) => {
    const hijriYear = getHijriYear();
    const currentMonth = new Date().getMonth();
    const semester = currentMonth >= 1 && currentMonth <= 5 ? "الثاني" : currentMonth >= 6 && currentMonth <= 7 ? "الثالث" : "الأول";
    const baseUrl = window.location.origin;
    const html = `<!DOCTYPE html><html dir="rtl"><head><meta charset="utf-8"><title>شهادة انضباط دراسي - ${student.name}</title>
    <link href="https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700;800;900&family=Tajawal:wght@400;500;700;800;900&family=Amiri:wght@400;700&display=swap" rel="stylesheet">
    <style>
      @page { size: A4 landscape; margin: 0; }
      * { margin: 0; padding: 0; box-sizing: border-box; }
      body { font-family: 'Cairo', 'Tajawal', 'Amiri', 'Traditional Arabic', Arial, sans-serif; width: 297mm; height: 210mm; position: relative; display: flex; align-items: center; justify-content: center; background: #fff; }
      .cert-container { width: 280mm; height: 192mm; position: relative; border: 12px solid #0d6b4e; border-radius: 16px; padding: 18px 40px 16px; display: flex; flex-direction: column; background: linear-gradient(135deg, rgba(255,255,255,1) 0%, rgba(245,250,248,1) 100%); }
      .cert-border-inner { position: absolute; top: 8px; left: 8px; right: 8px; bottom: 8px; border: 3px solid #c5a028; border-radius: 12px; pointer-events: none; }
      .cert-border-outer { position: absolute; top: 3px; left: 3px; right: 3px; bottom: 3px; border: 1px solid #0d6b4e40; border-radius: 14px; pointer-events: none; }
      .cert-corner { position: absolute; width: 50px; height: 50px; }
      .cert-corner.tl { top: 15px; left: 15px; border-top: 5px solid #c5a028; border-left: 5px solid #c5a028; border-radius: 12px 0 0 0; }
      .cert-corner.tr { top: 15px; right: 15px; border-top: 5px solid #c5a028; border-right: 5px solid #c5a028; border-radius: 0 12px 0 0; }
      .cert-corner.bl { bottom: 15px; left: 15px; border-bottom: 5px solid #c5a028; border-left: 5px solid #c5a028; border-radius: 0 0 0 12px; }
      .cert-corner.br { bottom: 15px; right: 15px; border-bottom: 5px solid #c5a028; border-right: 5px solid #c5a028; border-radius: 0 0 12px 0; }
      .cert-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px; }
      .cert-logo-right { text-align: center; width: 160px; flex-shrink: 0; }
      .cert-logo-left { text-align: center; width: 160px; flex-shrink: 0; }
      .cert-logo-right img, .cert-logo-left img { width: 140px; height: auto; }
      .cert-title-block { text-align: center; flex: 1; padding: 0 15px; }
      .cert-title-block h1 { font-family: 'Amiri', serif; font-size: 54px; color: #0d6b4e; font-weight: 700; letter-spacing: 6px; display: inline-block; padding-bottom: 10px; margin-bottom: 4px; position: relative; text-shadow: 0 2px 8px rgba(13,107,78,0.10); }
      .cert-title-block h1::after { content: ''; position: absolute; bottom: 0; left: 10%; right: 10%; height: 4px; background: linear-gradient(90deg, transparent, #c5a028, #0d6b4e, #c5a028, transparent); border-radius: 4px; }
      .cert-title-block .sub { font-size: 15px; color: #555; margin-top: 8px; font-weight: 700; letter-spacing: 1px; white-space: nowrap; }
      .cert-body { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; gap: 12px; }
      .cert-body .intro { font-size: 26px; color: #333; line-height: 1.9; font-weight: 700; }
      .cert-body .student-name { font-family: 'Amiri', serif; font-size: 50px; font-weight: 700; color: #0d6b4e; margin: 12px 0; letter-spacing: 4px; display: inline-block; padding: 6px 30px; text-shadow: 0 2px 10px rgba(13,107,78,0.12); position: relative; }
      .cert-body .student-name::before { content: '✦'; position: absolute; right: -10px; top: 50%; transform: translateY(-50%); font-size: 18px; color: #c5a028; }
      .cert-body .student-name::after { content: '✦'; position: absolute; left: -10px; top: 50%; transform: translateY(-50%); font-size: 18px; color: #c5a028; }
      .cert-body .desc { font-size: 23px; color: #444; line-height: 2.2; max-width: 90%; font-weight: 600; }
      .cert-body .dua { font-size: 22px; color: #555; margin-top: 6px; font-weight: 700; font-style: italic; }
      .cert-footer { display: flex; justify-content: space-between; align-items: flex-start; margin-top: auto; padding-top: 22px; padding-bottom: 10px; border-top: 2px solid #0d6b4e15; gap: 40px; }
      .cert-sig { text-align: center; min-width: 230px; flex: 1; }
      .cert-sig .sig-title { font-size: 19px; font-weight: 800; color: #0d6b4e; margin-bottom: 18px; white-space: nowrap; }
      .cert-sig .sig-name { font-size: 17px; color: #333; font-weight: 700; white-space: nowrap; }
      .cert-sig .sig-line { width: 180px; height: 1px; background: #999; margin: 12px auto 6px; }
      @media print { body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }
    </style></head><body>
    <div class="cert-container">
      <div class="cert-border-outer"></div>
      <div class="cert-border-inner"></div>
      <div class="cert-corner tl"></div>
      <div class="cert-corner tr"></div>
      <div class="cert-corner bl"></div>
      <div class="cert-corner br"></div>
      
      <div class="cert-header">
        <div class="cert-logo-right">
          <img src="${baseUrl}/images/vision2030-logo.png" alt="رؤية 2030" />
        </div>
        <div class="cert-title-block">
          <h1>شهادة انضباط دراسي</h1>
        </div>
        <div class="cert-logo-left">
          <img src="${baseUrl}/images/moe-logo.png" alt="وزارة التعليم" />
        </div>
      </div>

      <div class="cert-body">
        <p class="intro">تتقدم إدارة مدرسة اليعقوبي الثانوية بالشكر والتقدير</p>
        <p class="student-name">الطالب / ${student.name}</p>
        <div class="desc">
          على تميزه في الانضباط المدرسي والالتزام بالحضور والانصراف
          <br/>
          كما نتقدم بالشكر الجزيل لأسرته على الاهتمام وحسن المتابعة
        </div>
        <p class="dua">سائلين الله له التوفيق والنجاح</p>
      </div>
      
      <div class="cert-footer">
        <div class="cert-sig">
          <div class="sig-title">لجنة التوجيه الطلابي</div>
          <div class="sig-line"></div>
          <div class="sig-name">عدنان علي الزريق / عادل علي السبعان</div>
        </div>
        <div class="cert-sig">
          <div class="sig-title">مدير المدرسة</div>
          <div class="sig-line"></div>
          <div class="sig-name">فهد حامد الزهراني</div>
        </div>
      </div>
    </div>
    </body></html>`;
    const w = window.open("", "_blank");
    if (w) { w.document.write(html); w.document.close(); w.print(); }
  };

  if (loading) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center min-h-[60vh]">
          <div className="text-center">
            <div className="w-10 h-10 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-4" />
            <p className="text-muted-foreground text-sm">جارٍ تحليل سجلات الطلاب...</p>
          </div>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      {/* Read-only notice */}
      {!canIssueCertificate && (
        <div className="mb-4 flex items-center gap-2 px-4 py-3 rounded-xl bg-muted/50 border border-border/50 text-sm text-muted-foreground">
          <Trophy size={16} className="text-warning shrink-0" />
          <span>وضع الاطلاع فقط — يمكنك مشاهدة قائمة الطلاب المتميزين دون تنفيذ أي إجراء</span>
        </div>
      )}
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-start justify-between flex-wrap gap-4">
          <div>
            <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
              <Trophy className="text-warning" size={28} />
              السلوك الإيجابي
            </h1>
            <p className="text-sm text-muted-foreground mt-1">برنامج تعزيز السلوك الإيجابي – وفق قواعد السلوك والمواظبة 1447هـ</p>
          </div>
          {canIssueCertificate && activeTab === "distinguished" && (
            <button onClick={printList} className="flex items-center gap-2 px-4 py-2 rounded-xl bg-primary text-primary-foreground hover:bg-primary/90 transition-all text-sm font-semibold shadow-md">
              <Printer size={16} /> طباعة الكشف
            </button>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="mb-6 flex items-center gap-2 border-b border-border">
        <button
          onClick={() => setActiveTab("distinguished")}
          className={`px-4 py-2.5 text-sm font-semibold border-b-2 transition-colors flex items-center gap-2 ${activeTab === "distinguished" ? "border-warning text-warning" : "border-transparent text-muted-foreground hover:text-foreground"}`}
        >
          <Trophy size={16} /> الطلاب المتميزون سلوكياً
        </button>
        <button
          onClick={() => setActiveTab("improvement")}
          className={`px-4 py-2.5 text-sm font-semibold border-b-2 transition-colors flex items-center gap-2 ${activeTab === "improvement" ? "border-warning text-warning" : "border-transparent text-muted-foreground hover:text-foreground"}`}
        >
          <TrendingUp size={16} /> مسار التحسن السلوكي
        </button>
        <button
          onClick={() => setActiveTab("classes")}
          className={`px-4 py-2.5 text-sm font-semibold border-b-2 transition-colors flex items-center gap-2 ${activeTab === "classes" ? "border-warning text-warning" : "border-transparent text-muted-foreground hover:text-foreground"}`}
        >
          <Medal size={16} /> الفصول المتميزة
        </button>
      </div>

      {activeTab === "improvement" ? (
        <ImprovementTrackTab />
      ) : activeTab === "classes" ? (
        <OutstandingClassesSection hijriDate={getFullHijriDate()} />
      ) : (
      <>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-8">
        <div className="rounded-2xl border border-success/20 bg-success/5 p-5 text-center">
          <Award size={28} className="text-success mx-auto mb-2" />
          <p className="text-3xl font-bold text-success">{positiveStudents.length}</p>
          <p className="text-xs font-semibold text-success/80 mt-1">طالب متميز</p>
        </div>
        <div className="rounded-2xl border border-primary/20 bg-primary/5 p-5 text-center">
          <Star size={28} className="text-primary mx-auto mb-2" />
          <p className="text-3xl font-bold text-primary">{positiveRate}%</p>
          <p className="text-xs font-semibold text-primary/80 mt-1">نسبة التميز</p>
        </div>
        <div className="rounded-2xl border border-warning/20 bg-warning/5 p-5 text-center">
          <Medal size={28} className="text-warning mx-auto mb-2" />
          <p className="text-3xl font-bold text-warning">100</p>
          <p className="text-xs font-semibold text-warning/80 mt-1">درجة السلوك</p>
        </div>
        <div className="rounded-2xl border border-border bg-card p-5 text-center">
          <Users size={28} className="text-muted-foreground mx-auto mb-2" />
          <p className="text-3xl font-bold text-foreground">{totalStudents}</p>
          <p className="text-xs font-semibold text-muted-foreground mt-1">إجمالي الطلاب</p>
        </div>
      </div>

      {/* Criteria */}
      <div className="mb-8 bg-card rounded-2xl border border-border/50 p-5 shadow-sm">
        <h2 className="text-base font-bold text-foreground mb-4 flex items-center gap-2">
          <Sparkles size={18} className="text-warning" />
          مؤشرات السلوك المتميز (استمارة التكريم على مستوى الفصل)
        </h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-muted/50">
                <th className="text-right px-3 py-2 text-muted-foreground font-semibold">نوع السلوك</th>
                <th className="text-right px-3 py-2 text-muted-foreground font-semibold">المؤشر</th>
                <th className="text-center px-3 py-2 text-muted-foreground font-semibold">الدرجة</th>
              </tr>
            </thead>
            <tbody>
              {POSITIVE_CRITERIA.map((c, i) => (
                <tr key={i} className="border-t border-border/30">
                  <td className="px-3 py-2 text-xs">
                    <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-bold ${c.type === "سلوك إيجابي" ? "bg-success/10 text-success" : "bg-warning/10 text-warning"}`}>{c.type}</span>
                  </td>
                  <td className="px-3 py-2 text-foreground">{c.label}</td>
                  <td className="px-3 py-2 text-center font-bold text-primary">{c.points}</td>
                </tr>
              ))}
              <tr className="border-t-2 border-primary/30 bg-primary/5">
                <td colSpan={2} className="px-3 py-2 font-bold text-foreground text-center">المجموع</td>
                <td className="px-3 py-2 text-center font-bold text-primary text-lg">100</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 mb-6 flex-wrap">
        <div className="relative flex-1 max-w-xs">
          <Search size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            placeholder="بحث بالاسم أو الرقم..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pr-9 pl-3 py-2.5 rounded-xl border border-border bg-card text-sm text-foreground placeholder:text-muted-foreground focus:ring-2 focus:ring-primary/30 focus:border-primary outline-none"
          />
        </div>
        <select
          value={selectedGrade}
          onChange={e => setSelectedGrade(e.target.value)}
          className="px-3 py-2.5 rounded-xl border border-border bg-card text-sm text-foreground"
        >
          <option value="all">جميع المراحل</option>
          {grades.map(g => <option key={g.code} value={g.code}>{g.name}</option>)}
        </select>
      </div>

      {/* Student List grouped by grade */}
      {Object.keys(groupedByGrade).length === 0 ? (
        <div className="text-center py-16 bg-card rounded-2xl border border-border/50">
          <Award size={48} className="mx-auto text-muted-foreground/30 mb-4" />
          <p className="text-muted-foreground">لا يوجد طلاب مطابقون للمعايير حالياً</p>
        </div>
      ) : (
        <div className="space-y-4">
          {Object.entries(groupedByGrade).map(([code, students]) => {
            const gradeName = GRADE_CODE_MAP[code] || code;
            const isExp = expandedGrade === code;
            return (
              <div key={code} className="bg-card rounded-2xl border border-border/50 overflow-hidden shadow-sm">
                <button
                  onClick={() => setExpandedGrade(isExp ? null : code)}
                  className="w-full flex items-center justify-between p-4 hover:bg-muted/20 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-success/10 text-success flex items-center justify-center">
                      <Trophy size={20} />
                    </div>
                    <div className="text-right">
                      <h3 className="text-sm font-bold text-foreground">{gradeName}</h3>
                      <p className="text-xs text-muted-foreground">{students.length} طالب متميز</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-2xl font-bold text-success">{students.length}</span>
                    {isExp ? <ChevronUp size={20} className="text-muted-foreground" /> : <ChevronDown size={20} className="text-muted-foreground" />}
                  </div>
                </button>

                {isExp && (
                  <div className="border-t border-border/30 divide-y divide-border/20 max-h-[500px] overflow-y-auto">
                    {students.map((s, idx) => (
                      <div key={s.id} className="flex items-center justify-between px-5 py-3 hover:bg-success/5 transition-colors">
                        <div className="flex items-center gap-3 min-w-0 flex-1">
                          <span className="w-8 h-8 rounded-full bg-success/10 text-success flex items-center justify-center text-xs font-bold shrink-0">
                            {idx + 1}
                          </span>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <p className="font-bold text-foreground text-sm">{s.name}</p>
                              <span className="text-[10px] text-muted-foreground bg-muted/40 px-1.5 py-0.5 rounded">{s.grade} - {s.section}</span>
                              <span className="text-[10px] text-muted-foreground bg-muted/30 px-1.5 py-0.5 rounded">{s.studentNumber}</span>
                            </div>
                            <div className="flex items-center gap-1.5 mt-1">
                              {s.badges.map((b, bi) => (
                                <span key={bi} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-success/10 text-success text-[10px] font-semibold border border-success/20">
                                  <Star size={10} /> {b}
                                </span>
                              ))}
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          {canIssueCertificate && (
                            <button
                              onClick={() => printCertificate(s)}
                              className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-success/10 text-success hover:bg-success/20 transition-colors text-[11px] font-semibold border border-success/20"
                              title="إصدار شهادة انضباط دراسي"
                            >
                              <FileText size={13} /> شهادة
                            </button>
                          )}
                          {canIssueCertificate && (
                            <button
                              onClick={() => sendWhatsAppCongrats(s)}
                              className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-emerald-500/10 text-emerald-600 hover:bg-emerald-500/20 transition-colors text-[11px] font-semibold border border-emerald-500/20"
                              title="إرسال رسالة تحفيزية لولي الأمر"
                            >
                              <MessageCircle size={13} /> واتساب
                            </button>
                          )}
                          <span className="text-lg font-bold text-success">{s.score}</span>
                          <span className="text-[10px] text-muted-foreground">درجة</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Footer note */}
      <div className="mt-8 bg-muted/30 rounded-xl p-4 border border-border/30">
        <p className="text-xs text-muted-foreground leading-relaxed">
          <strong>ملاحظة:</strong> يتم تكريم الطالب في حال حصوله على الدرجة الكاملة في استمارة تقييم مؤشرات السلوك المتميز.
          يُستكمل التقييم من قبل رائد الفصل مع إحضار الشواهد التي تثبت مشاركة الطالب من الجهات ذات العلاقة.
          <br />
          <em>المرجع: برنامج تعزيز السلوك الإيجابي – قواعد السلوك والمواظبة 1447هـ</em>
        </p>
      </div>
      </>
      )}
    </AppLayout>
  );
};

export default PositiveBehaviorPage;
