import { useState, useRef } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { getStudentsFromDB } from "@/store/studentsStore";
import { openWhatsApp } from "@/utils/whatsapp";
import { getHijriDateShort } from "@/utils/hijri";
import { toast } from "@/hooks/use-toast";
import { Printer, FileText, MessageCircle, Send, CheckCircle2 } from "lucide-react";

interface ReferralFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  studentData: {
    studentId: string;
    name: string;
    grade: string;
    section: number;
    count: number;
    caseType: string;
    previousActions: string[];
  };
  onSuccess?: () => void;
}

const CASE_LABELS: Record<string, string> = {
  absent: "غياب متكرر",
  late: "تأخر متكرر",
  violation: "مخالفات سلوكية متكررة",
};

const CASE_UNIT: Record<string, string> = {
  absent: "يوم غياب",
  late: "مرة تأخر",
  violation: "مخالفة سلوكية",
};

const ReferralFormDialog = ({ open, onOpenChange, studentData, onSuccess }: ReferralFormDialogProps) => {
  const { profile, user } = useAuth();
  const [referralType, setReferralType] = useState<string>("vice_principal");
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const printRef = useRef<HTMLDivElement>(null);

  const today = getHijriDateShort();
  const referredToLabel = referralType === "vice_principal" ? "وكيل شؤون الطلاب" : "الموجه الطلابي";
  const referredToName = referralType === "vice_principal" ? "عدنان علي الزريق" : "عادل علي السبعان";
  const firstName = studentData.name.split(" ")[0];

  const previousActionsText = studentData.previousActions.length > 0
    ? studentData.previousActions.join(" ← ")
    : "لا توجد إجراءات سابقة مسجلة";

  const handleSave = async () => {
    if (!user) return;
    setSaving(true);
    try {
      const { error } = await supabase.from("student_referrals" as any).insert({
        student_id: studentData.studentId,
        student_name: studentData.name,
        grade: studentData.grade,
        section: studentData.section,
        referral_type: referralType,
        case_type: studentData.caseType,
        repetition_count: studentData.count,
        previous_actions: previousActionsText,
        referral_reason: reason || `تحويل بسبب ${CASE_LABELS[studentData.caseType] || studentData.caseType}`,
        referred_by: user.id,
        referred_by_name: profile?.full_name || "",
        referred_to_name: referredToName,
        referral_date: new Date().toISOString().split("T")[0],
        status: "pending",
      } as any).select().single();

      if (error) throw error;
      setSaved(true);
      toast({ title: "تم التحويل بنجاح", description: `تم تحويل الطالب إلى ${referredToLabel}` });
      onSuccess?.();
    } catch (e: any) {
      toast({ title: "خطأ", description: e.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const handlePrint = () => {
    const content = printRef.current;
    if (!content) return;
    const win = window.open("", "_blank");
    if (!win) return;
    win.document.write(`<!DOCTYPE html><html dir="rtl" lang="ar"><head><meta charset="UTF-8">
      <title>نموذج تحويل طالب</title>
      <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: 'Segoe UI', Tahoma, sans-serif; direction: rtl; padding: 24px 30px; font-size: 13px; color: #1a1a1a; }
        .official-header { text-align: center; margin-bottom: 16px; padding-bottom: 12px; border-bottom: 3px double #065f46; }
        .official-header .ministry { font-size: 11px; color: #444; margin-bottom: 2px; }
        .official-header .school-name { font-size: 16px; font-weight: 700; color: #065f46; margin: 4px 0; }
        .official-header .form-title { font-size: 14px; font-weight: 700; color: #065f46; background: #ecfdf5; display: inline-block; padding: 4px 20px; border-radius: 4px; margin-top: 6px; }
        .official-header .date { font-size: 10px; color: #666; margin-top: 4px; }
        table { width: 100%; border-collapse: collapse; margin-bottom: 12px; }
        th, td { border: 1px solid #c5c5c5; padding: 6px 10px; text-align: right; font-size: 12px; }
        th { background: #f0fdf4; color: #065f46; font-weight: 600; width: 22%; }
        .section-title { background: #f0fdf4; padding: 6px 10px; font-weight: 700; color: #065f46; border: 1px solid #bbf7d0; margin: 12px 0 6px; border-radius: 4px; font-size: 12px; }
        .referral-box { border: 1px solid #d1d5db; border-radius: 6px; padding: 10px; margin: 8px 0; }
        .referral-box .title { font-weight: 700; color: #065f46; font-size: 12px; margin-bottom: 6px; border-bottom: 1px solid #e5e7eb; padding-bottom: 4px; }
        .referral-box p { font-size: 11px; color: #333; margin: 3px 0; }
        .sig-row { display: flex; justify-content: space-between; margin-top: 6px; padding-top: 4px; }
        .sig-box { text-align: center; width: 30%; font-size: 10px; color: #666; }
        .sig-box .line { border-top: 1px solid #333; margin-top: 24px; padding-top: 3px; }
        .actions-list { padding-right: 16px; }
        .actions-list li { font-size: 11px; margin: 2px 0; }
        .checkbox-line { font-size: 11px; color: #333; margin: 3px 0; }
        .checkbox-line::before { content: '☐ '; }
        @media print { body { padding: 15px; } }
      </style>
    </head><body>${content.innerHTML}
    <script>window.onload=function(){window.print();}<\/script>
    </body></html>`);
    win.document.close();
  };

  const buildWhatsAppMessage = (): string => {
    const caseLabel = CASE_LABELS[studentData.caseType] || "حالة متكررة";
    const unit = CASE_UNIT[studentData.caseType] || "مرة";

    let summary = "";
    if (studentData.caseType === "absent") {
      summary = `سُجل على الطالب ${firstName} عدد (${studentData.count}) ${unit}`;
    } else if (studentData.caseType === "late") {
      summary = `سُجل على الطالب ${firstName} عدد (${studentData.count}) ${unit}`;
    } else {
      summary = `سُجل على الطالب ${firstName} عدد (${studentData.count}) ${unit}`;
    }

    return `السلام عليكم ورحمة الله وبركاته\n` +
      `ولي أمر الطالب: ${firstName}\n` +
      `الصف: ${studentData.grade} - فصل ${studentData.section}\n\n` +
      `نُفيدكم بأنه ${summary}، وقد تم اتخاذ الإجراءات التربوية اللازمة وفق الأنظمة المعتمدة.\n\n` +
      `وبناءً على ذلك، تمت إحالة الحالة إلى ${referredToLabel} لاستكمال المتابعة.\n\n` +
      `نأمل التعاون والتواصل مع المدرسة لمتابعة وضع الطالب.\n\n` +
      `مدرسة اليعقوبي الثانوية 🏫`;
  };

  const handleWhatsApp = () => {
    const msg = buildWhatsAppMessage();
    const student = getStudentsFromDB().find((item) => item.id === studentData.studentId || item.name === studentData.name);
    const targetPhone = student?.guardianPhone?.trim();

    if (!targetPhone) {
      toast({ title: "لا يوجد رقم لولي الأمر", variant: "destructive" });
      return;
    }

    const sent = openWhatsApp(targetPhone, msg);
    if (!sent) {
      toast({
        title: "تعذر فتح واتساب",
        description: "تحقق من السماح بفتح الروابط الخارجية في المتصفح ثم أعد المحاولة",
        variant: "destructive",
      });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-lg font-bold text-primary flex items-center gap-2">
            <FileText size={20} />
            نموذج تحويل رسمي
          </DialogTitle>
        </DialogHeader>

        {/* Referral type selector */}
        {!saved && (
          <div className="space-y-4">
            <div>
              <label className="text-sm font-semibold text-foreground mb-1 block">التحويل إلى</label>
              <Select value={referralType} onValueChange={setReferralType}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="vice_principal">وكيل شؤون الطلاب</SelectItem>
                  <SelectItem value="counselor">الموجه الطلابي</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-sm font-semibold text-foreground mb-1 block">سبب التحويل (اختياري)</label>
              <Textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder={`تحويل بسبب ${CASE_LABELS[studentData.caseType] || "حالة متكررة"}`}
                className="min-h-[60px]"
              />
            </div>
          </div>
        )}

        {/* Printable form content */}
        <div ref={printRef} className="space-y-2 mt-2">
          {/* Official Header */}
          <div className="official-header text-center border-b-2 border-primary pb-3 mb-2">
            <p className="text-[10px] text-muted-foreground leading-tight">المملكة العربية السعودية</p>
            <p className="text-[10px] text-muted-foreground leading-tight">وزارة التعليم</p>
            <p className="text-[10px] text-muted-foreground leading-tight">الإدارة العامة للتعليم بالمنطقة الشرقية</p>
            <h2 className="text-sm font-bold text-primary mt-1">مدرسة اليعقوبي الثانوية</h2>
            <div className="inline-block bg-primary/10 text-primary text-xs font-bold px-4 py-1 rounded mt-1">
              نموذج تحويل طالب
            </div>
            <p className="text-[10px] text-muted-foreground mt-1">الفصل الدراسي الثاني من العام ١٤٤٧هـ — التاريخ: {today}</p>
          </div>

          {/* Student info table */}
          <table className="w-full border-collapse text-xs">
            <tbody>
              <tr>
                <th className="bg-primary/5 border border-border p-2 text-right font-semibold w-[22%]">اسم الطالب</th>
                <td className="border border-border p-2">{studentData.name}</td>
                <th className="bg-primary/5 border border-border p-2 text-right font-semibold w-[22%]">الصف والشعبة</th>
                <td className="border border-border p-2">{studentData.grade} - فصل {studentData.section}</td>
              </tr>
              <tr>
                <th className="bg-primary/5 border border-border p-2 text-right font-semibold">نوع الحالة</th>
                <td className="border border-border p-2">{CASE_LABELS[studentData.caseType] || studentData.caseType}</td>
                <th className="bg-primary/5 border border-border p-2 text-right font-semibold">عدد التكرار</th>
                <td className="border border-border p-2 font-bold text-destructive">{studentData.count} مرة</td>
              </tr>
              <tr>
                <th className="bg-primary/5 border border-border p-2 text-right font-semibold">تاريخ التحويل</th>
                <td className="border border-border p-2">{today}</td>
                <th className="bg-primary/5 border border-border p-2 text-right font-semibold">المحوّل</th>
                <td className="border border-border p-2">{profile?.full_name || ""}</td>
              </tr>
            </tbody>
          </table>

          {/* Referral destination */}
          <div className="bg-primary/5 border border-primary/20 rounded-lg p-3">
            <p className="font-bold text-xs text-primary mb-1">إلى سعادة {referredToLabel}: {referredToName}</p>
            <p className="text-[11px] text-foreground">أحيل لسعادتكم الطالب الموضح اسمه أعلاه، وذلك بعد استنفاد الإجراءات التربوية المعتمدة، للتفضل بالاطلاع واتخاذ ما يلزم وفق قواعد السلوك والمواظبة.</p>
            <p className="text-[11px] text-foreground mt-1 font-semibold">سبب التحويل: {reason || CASE_LABELS[studentData.caseType]}</p>
          </div>

          {/* Previous actions */}
          <div className="border border-border rounded-lg p-3">
            <p className="text-xs font-bold text-primary mb-2">الإجراءات التي تم اتخاذها قبل التحويل:</p>
            <div className="space-y-1">
              {studentData.previousActions.length > 0 ? (
                studentData.previousActions.map((action, i) => (
                  <p key={i} className="text-[11px] text-foreground flex items-center gap-1">
                    <CheckCircle2 size={11} className="text-primary shrink-0" />
                    {action}
                  </p>
                ))
              ) : (
                <p className="text-[11px] text-muted-foreground">لا توجد إجراءات سابقة مسجلة</p>
              )}
            </div>
          </div>

          {/* Counselor section */}
          <div className="border border-border rounded-lg p-3">
            <p className="font-bold text-xs text-primary mb-2">الموجه الطلابي: {referralType === "counselor" ? referredToName : "عادل علي السبعان"}</p>
            <div className="space-y-1 text-[11px] text-muted-foreground">
              <p>الملاحظات: ............................................................................................................</p>
              <p>الإجراء المتخذ: ............................................................................................................</p>
              <p>التوصية: ............................................................................................................</p>
            </div>
            <div className="flex justify-between mt-3 text-[10px] text-muted-foreground">
              <span>اسم الموجه الطلابي: ....................</span>
              <span>التوقيع: ....................</span>
              <span>التاريخ: ....................</span>
            </div>
          </div>

          {/* Vice principal section */}
          <div className="border border-border rounded-lg p-3">
            <p className="font-bold text-xs text-primary mb-2">وكيل شؤون الطلاب: عدنان علي الزريق</p>
            <div className="space-y-1 text-[11px] text-muted-foreground">
              <p>تم إنهاء الموقف بتاريخ: ....../....../......١٤هـ</p>
              <p>يتم حسم (.........) درجة على الطالب من درجات ☐ السلوك ☐ المواظبة</p>
            </div>
            <div className="flex justify-between mt-3 text-[10px] text-muted-foreground">
              <span>اسم الوكيل: ....................</span>
              <span>التوقيع: ....................</span>
              <span>التاريخ: ....................</span>
            </div>
          </div>

          {/* Follow-up section */}
          <div className="border border-border rounded-lg p-3">
            <p className="font-bold text-xs text-primary mb-2">متابعة الموجه الطلابي</p>
            <div className="space-y-1 text-[11px] text-muted-foreground">
              <p>☐ نرى تثبيت درجة الحسم لعدم استجابة الطالب خلال الفترة السابقة</p>
              <p>☐ نرى إلغاء حسم الدرجة لتحسن مستوى الطالب</p>
            </div>
            <div className="flex justify-between mt-3 text-[10px] text-muted-foreground">
              <span>اسم الموجه الطلابي: ....................</span>
              <span>التوقيع: ....................</span>
              <span>التاريخ: ....................</span>
            </div>
          </div>

          {/* Signatures footer */}
          <div className="signature-footer border border-border rounded-lg p-3">
            <p className="signature-title font-bold text-xs text-primary mb-3">التوقيعات</p>
            <table className="signature-table w-full table-fixed border-separate text-center">
              <tbody>
                <tr>
                  <td className="align-top px-2">
                    <p className="signature-role mb-6 text-[10px] text-muted-foreground">المعلم / المحوّل</p>
                    <div className="signature-name border-t border-foreground pt-1 text-[10px]">{profile?.full_name || "................"}</div>
                  </td>
                  <td className="align-top px-2">
                    <p className="signature-role mb-6 text-[10px] text-muted-foreground">الموجه الطلابي</p>
                    <div className="signature-name border-t border-foreground pt-1 text-[10px]">عادل علي السبعان</div>
                  </td>
                  <td className="align-top px-2">
                    <p className="signature-role mb-6 text-[10px] text-muted-foreground">وكيل شؤون الطلاب</p>
                    <div className="signature-name border-t border-foreground pt-1 text-[10px]">عدنان علي الزريق</div>
                  </td>
                  <td className="align-top px-2">
                    <p className="signature-role mb-6 text-[10px] text-muted-foreground">مدير المدرسة</p>
                    <div className="signature-name border-t border-foreground pt-1 text-[10px]">فهد حامد الزهراني</div>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        {/* Actions */}
        <div className="flex flex-wrap gap-2 mt-4 border-t border-border pt-4">
          {!saved ? (
            <Button onClick={handleSave} disabled={saving} className="gap-1.5">
              <Send size={14} />
              {saving ? "جارٍ الحفظ..." : "تحويل وحفظ"}
            </Button>
          ) : (
            <span className="text-sm text-primary font-semibold flex items-center gap-1">
              <CheckCircle2 size={16} /> تم الحفظ
            </span>
          )}
          <Button variant="outline" size="sm" className="gap-1.5" onClick={handlePrint}>
            <Printer size={14} /> طباعة
          </Button>
          <Button variant="outline" size="sm" className="gap-1.5" onClick={handleWhatsApp}>
            <MessageCircle size={14} /> تواصل مع ولي الأمر
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default ReferralFormDialog;
