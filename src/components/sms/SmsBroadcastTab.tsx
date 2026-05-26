import { useMemo, useState } from "react";
import { Student } from "@/types/school";
import { formatSaudiPhone, isValidSaudiPhone } from "@/utils/whatsapp";
import { ensureSmsMaxLength, getStudentFirstName, READY_TEMPLATES, BROADCAST_CATEGORIES } from "@/utils/smsTemplates";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Send, RefreshCw, Users, Megaphone, BookOpen, Heart, Clock, Lightbulb, FileText, Star } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { SmsArchiveEntry } from "./SmsArchive";

const GRADE_OPTIONS = [
  { code: "all", name: "جميع المراحل" },
  { code: "1314", name: "أول ثانوي" },
  { code: "1416", name: "ثاني ثانوي" },
  { code: "1516", name: "ثالث ثانوي" },
];

const CATEGORY_ICONS: Record<string, React.ReactNode> = {
  "تعزيز": <Heart size={12} />,
  "دراسة": <BookOpen size={12} />,
  "انصراف": <Clock size={12} />,
  "نصائح": <Lightbulb size={12} />,
  "إجرائي": <FileText size={12} />,
  "عام": <Star size={12} />,
};

interface Props {
  students: Student[];
  apiToken: string;
  senderName: string;
  onArchiveAdd: (entries: SmsArchiveEntry[]) => void;
}

const SmsBroadcastTab = ({ students, apiToken, senderName, onArchiveAdd }: Props) => {
  const { profile } = useAuth();
  const [gradeFilter, setGradeFilter] = useState("all");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [messageText, setMessageText] = useState("");
  const [selectedTemplate, setSelectedTemplate] = useState("");
  const [sending, setSending] = useState(false);
  const [sentCount, setSentCount] = useState(0);

  const eligibleStudents = useMemo(() => {
    return students.filter(s => {
      if (!isValidSaudiPhone(s.guardianPhone)) return false;
      if (gradeFilter !== "all" && s.gradeCode !== gradeFilter) return false;
      return true;
    });
  }, [students, gradeFilter]);

  const filteredTemplates = useMemo(() => {
    if (categoryFilter === "all") return READY_TEMPLATES;
    return READY_TEMPLATES.filter(t => t.category === categoryFilter);
  }, [categoryFilter]);

  const handleTemplateSelect = (key: string) => {
    setSelectedTemplate(key);
    const tpl = READY_TEMPLATES.find(t => t.key === key);
    if (tpl) setMessageText(tpl.text);
  };

  const finalMessage = ensureSmsMaxLength(messageText.trim());
  const charCount = finalMessage.length;

  const sendDirectSms = async (phone: string, message: string): Promise<boolean> => {
    try {
      const res = await fetch("https://app.mobile.net.sa/api/v1/send", {
        method: "POST",
        headers: { Authorization: `Bearer ${apiToken}`, Accept: "application/json", "Content-Type": "application/json" },
        body: JSON.stringify({ number: phone, senderName, sendAtOption: "Now", messageBody: message, allow_duplicate: true }),
      });
      const data = await res.json();
      return data?.status === "Success" || Boolean(data?.data);
    } catch { return false; }
  };

  const handleSend = async () => {
    if (!apiToken || !finalMessage || eligibleStudents.length === 0) return;
    setSending(true);
    setSentCount(0);
    let sent = 0;
    const archiveEntries: SmsArchiveEntry[] = [];

    for (let i = 0; i < eligibleStudents.length; i++) {
      const s = eligibleStudents[i];
      const phone = formatSaudiPhone(s.guardianPhone);
      // الرسالة العامة: ولي أمر [الاسم الأول] + نص الرسالة (مقنن على 70 حرف)
      const firstName = getStudentFirstName(s.name);
      const personalizedMsg = ensureSmsMaxLength(`ولي أمر ${firstName}: ${finalMessage}`);
      const ok = await sendDirectSms(phone, personalizedMsg);
      if (ok) { sent++; setSentCount(sent); }
      archiveEntries.push({
        id: `${Date.now()}-bc-${i}`,
        studentName: s.name,
        phone,
        type: "late",
        message: personalizedMsg,
        sentAt: new Date().toISOString(),
        success: ok,
        sentByName: profile?.full_name || "",
        sentByRole: profile?.role_title || "",
      });
      if (i < eligibleStudents.length - 1) await new Promise(r => setTimeout(r, 400));
    }

    setSending(false);
    onArchiveAdd(archiveEntries);
    toast({ title: `تم إرسال ${sent} من ${eligibleStudents.length} رسالة عامة` });
  };

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-border bg-card p-4 space-y-4">
        <div className="flex items-center gap-2">
          <Megaphone size={18} className="text-primary" />
          <h3 className="text-sm font-bold text-foreground">رسائل عامة تربوية لأولياء الأمور</h3>
        </div>

        {/* فلتر المرحلة */}
        <Select value={gradeFilter} onValueChange={setGradeFilter}>
          <SelectTrigger className="text-xs"><SelectValue placeholder="اختر المرحلة" /></SelectTrigger>
          <SelectContent>
            {GRADE_OPTIONS.map(g => <SelectItem key={g.code} value={g.code}>{g.name}</SelectItem>)}
          </SelectContent>
        </Select>

        {/* تصنيفات القوالب */}
        <div>
          <label className="text-xs font-medium text-foreground mb-2 block">تصنيف القوالب</label>
          <div className="flex flex-wrap gap-1.5">
            {BROADCAST_CATEGORIES.map(cat => (
              <Badge
                key={cat.key}
                variant={categoryFilter === cat.key ? "default" : "outline"}
                className="cursor-pointer text-[10px] gap-1 transition-all hover:scale-105"
                onClick={() => setCategoryFilter(cat.key)}
              >
                {cat.key !== "all" && CATEGORY_ICONS[cat.key]}
                {cat.label}
              </Badge>
            ))}
          </div>
        </div>

        {/* اختيار قالب */}
        <div>
          <label className="text-xs font-medium text-foreground mb-1 block">اختر قالب جاهز</label>
          <Select value={selectedTemplate} onValueChange={handleTemplateSelect}>
            <SelectTrigger className="text-xs"><SelectValue placeholder="اختر قالب تربوي..." /></SelectTrigger>
            <SelectContent>
              {filteredTemplates.map(t => (
                <SelectItem key={t.key} value={t.key}>
                  <span className="flex items-center gap-2">
                    <span className="font-bold">{t.label}</span>
                    <span className="text-muted-foreground text-[10px]">({t.text.length} حرف)</span>
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* معاينة القالب المختار */}
        {selectedTemplate && (
          <div className="bg-muted/40 rounded-lg p-3 border border-border">
            <p className="text-[10px] text-muted-foreground mb-1">معاينة الرسالة:</p>
            <p className="text-xs text-foreground leading-relaxed" dir="rtl">
              ولي أمر <span className="font-bold text-primary">[اسم الطالب]</span>: {messageText}
            </p>
            <p className="text-[9px] text-muted-foreground mt-1">{`ولي أمر أحمد: ${messageText}`.length} حرف تقريبًا</p>
          </div>
        )}

        {/* نص الرسالة */}
        <div>
          <label className="text-xs font-medium text-foreground mb-1 block">نص الرسالة (أو عدّل القالب)</label>
          <Textarea
            value={messageText}
            onChange={e => setMessageText(ensureSmsMaxLength(e.target.value))}
            placeholder="اختر قالبًا أو اكتب رسالتك..."
            className="text-xs min-h-[60px]"
            dir="rtl"
            maxLength={70}
          />
          <p className={`text-[9px] mt-1 ${charCount > 60 ? "text-amber-600 font-bold" : "text-muted-foreground"}`}>
            {charCount}/70 حرف
          </p>
        </div>

        {/* عدد المستهدفين */}
        <div className="flex items-center justify-between bg-muted/30 rounded-lg p-3">
          <div className="flex items-center gap-2">
            <Users size={14} className="text-primary" />
            <span className="text-xs font-bold text-foreground">{eligibleStudents.length} ولي أمر</span>
            <span className="text-[10px] text-muted-foreground">
              ({gradeFilter === "all" ? "جميع المراحل" : GRADE_OPTIONS.find(g => g.code === gradeFilter)?.name})
            </span>
          </div>
        </div>

        <Button
          onClick={handleSend}
          disabled={sending || !finalMessage || eligibleStudents.length === 0 || !apiToken}
          className="gap-2 text-xs w-full"
        >
          {sending ? <RefreshCw size={14} className="animate-spin" /> : <Send size={14} />}
          {sending ? `جاري الإرسال... (${sentCount}/${eligibleStudents.length})` : `إرسال لـ ${eligibleStudents.length} ولي أمر`}
        </Button>
      </div>
    </div>
  );
};

export default SmsBroadcastTab;
