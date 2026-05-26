import { useCallback, useEffect, useMemo, useState } from "react";
import { Student, StudentAction, ActionType, ACTION_LABELS } from "@/types/school";
import { formatSaudiPhone, isValidSaudiPhone } from "@/utils/whatsapp";
import { ensureSmsMaxLength, FREQUENCY_TEMPLATES, getStudentFirstName } from "@/utils/smsTemplates";
import { useAuth } from "@/contexts/AuthContext";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Send, RefreshCw, Phone, TrendingUp, Edit3, Database } from "lucide-react";
import { Input } from "@/components/ui/input";
import { toast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { SmsArchiveEntry } from "./SmsArchive";
import { supabase } from "@/integrations/supabase/client";

interface FreqItem {
  student: Student;
  count: number;
  type: "late" | "absent" | "violation" | "class_note" | "permission";
  phone: string;
  message: string;
  selected: boolean;
  editedMessage?: string;
}

interface Props {
  actions: StudentAction[];
  students: Student[];
  apiToken: string;
  senderName: string;
  onArchiveAdd: (entries: SmsArchiveEntry[]) => void;
}

const FREQ_TYPES = [
  { key: "late", label: "الأكثر تأخراً" },
  { key: "absent", label: "الأكثر غياباً" },
  { key: "violation", label: "الأكثر مخالفة" },
  { key: "class_note", label: "الأكثر ملاحظات صفية" },
  { key: "permission", label: "الأكثر استئذاناً" },
] as const;

const CLASS_NOTE_TYPES = ["class_late", "class_escape", "class_chaos", "no_homework", "sleeping", "class_note"];
const MIN_REPEAT_COUNT = 2;

const getDbTypesForFreq = (freqType: string): string[] => {
  if (freqType === "class_note") return CLASS_NOTE_TYPES;
  if (freqType === "permission") return ["permission"];
  return [freqType];
};

const SmsFrequencyTab = ({ actions, students, apiToken, senderName, onArchiveAdd }: Props) => {
  const { profile } = useAuth();
  const [freqType, setFreqType] = useState<string>("late");
  const [sending, setSending] = useState(false);
  const [sentCount, setSentCount] = useState(0);
  const [editingIdx, setEditingIdx] = useState<number | null>(null);
  const [dbCounts, setDbCounts] = useState<Map<string, number>>(new Map());
  const [loadingCounts, setLoadingCounts] = useState(false);
  const [refreshTick, setRefreshTick] = useState(0);

  const studentsMap = useMemo(() => new Map(students.map(s => [s.id, s])), [students]);

  // Live fetch from database — paginated to bypass the 1000-row limit
  const loadDbCounts = useCallback(async (signal?: AbortSignal) => {
    setLoadingCounts(true);
    try {
      const types = getDbTypesForFreq(freqType);
      const counts = new Map<string, number>();
      const pageSize = 1000;

      for (let from = 0; ; from += pageSize) {
        let query = supabase
          .from("student_actions")
          .select("student_id, student_number")
          .in("type", types)
          .range(from, from + pageSize - 1);

        if (signal) query = query.abortSignal(signal);

        const { data, error } = await query;
        if (error) {
          console.error("Failed to load frequency counts:", error);
          break;
        }
        if (!data || data.length === 0) break;

        for (const row of data as Array<{ student_id: string; student_number: string | null }>) {
          const id = row.student_id;
          if (!id) continue;
          counts.set(id, (counts.get(id) || 0) + 1);
        }

        if (data.length < pageSize) break;
      }

      setDbCounts(counts);
    } catch (err: any) {
      if (err?.name !== "AbortError") {
        console.error("Frequency counts error:", err);
      }
    } finally {
      setLoadingCounts(false);
    }
  }, [freqType]);

  useEffect(() => {
    const controller = new AbortController();
    loadDbCounts(controller.signal);
    return () => controller.abort();
  }, [loadDbCounts, refreshTick]);

  // Realtime: refresh counts whenever student_actions change
  useEffect(() => {
    const channel = supabase
      .channel(`sms-frequency-${freqType}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "student_actions" }, () => {
        setRefreshTick(t => t + 1);
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [freqType]);

  const freqItems = useMemo((): FreqItem[] => {
    const items: FreqItem[] = [];
    for (const [sid, count] of dbCounts) {
      if (count < MIN_REPEAT_COUNT) continue;
      const student = studentsMap.get(sid);
      if (!student) continue;
      const validPhone = isValidSaudiPhone(student.guardianPhone);
      const phone = validPhone ? formatSaudiPhone(student.guardianPhone) : "";
      const tpl = FREQUENCY_TEMPLATES[freqType as keyof typeof FREQUENCY_TEMPLATES];
      const message = tpl ? tpl(getStudentFirstName(student.name), count) : "";
      items.push({
        student,
        count,
        type: freqType as FreqItem["type"],
        phone,
        message,
        selected: validPhone,
      });
    }
    return items.sort((a, b) => b.count - a.count || a.student.name.localeCompare(b.student.name, "ar"));
  }, [dbCounts, freqType, studentsMap]);

  const [items, setItems] = useState<FreqItem[]>(freqItems);
  useEffect(() => { setItems(freqItems); setSentCount(0); }, [freqItems]);

  const selectedItems = items.filter(i => i.selected && i.phone);
  const totalStudents = items.length;
  const totalRepeats = items.reduce((sum, item) => sum + item.count, 0);
  const sendableCount = items.filter(i => i.phone).length;

  const toggleItem = (idx: number) => {
    setItems(prev => prev.map((item, i) => i === idx ? { ...item, selected: !item.selected } : item));
  };

  const toggleAll = (checked: boolean) => {
    setItems(prev => prev.map(item => ({ ...item, selected: checked && Boolean(item.phone) })));
  };

  const updateMessage = (idx: number, newMsg: string) => {
    setItems(prev => prev.map((item, i) => i === idx ? { ...item, editedMessage: ensureSmsMaxLength(newMsg) } : item));
  };

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

  const handleSendAll = async () => {
    if (!apiToken || selectedItems.length === 0) return;
    setSending(true);
    let sent = 0;
    const archiveEntries: SmsArchiveEntry[] = [];

    for (let i = 0; i < items.length; i++) {
      if (!items[i].selected) continue;
      const msg = ensureSmsMaxLength(items[i].editedMessage || items[i].message);
      const ok = await sendDirectSms(items[i].phone, msg);
      if (ok) { sent++; setSentCount(sent); }
      archiveEntries.push({
        id: `${Date.now()}-freq-${i}`,
        studentName: items[i].student.name,
        phone: items[i].phone,
        type: items[i].type as ActionType,
        message: msg,
        sentAt: new Date().toISOString(),
        success: ok,
        sentByName: profile?.full_name || "",
        sentByRole: profile?.role_title || "",
      });
      if (i < items.length - 1) await new Promise(r => setTimeout(r, 500));
    }

    setSending(false);
    onArchiveAdd(archiveEntries);
    toast({ title: `تم إرسال ${sent} من ${selectedItems.length} رسالة` });
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 flex-wrap">
        <Select value={freqType} onValueChange={setFreqType}>
          <SelectTrigger className="text-xs flex-1 min-w-[180px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            {FREQ_TYPES.map(t => <SelectItem key={t.key} value={t.key}>{t.label}</SelectItem>)}
          </SelectContent>
        </Select>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setRefreshTick(t => t + 1)}
          disabled={loadingCounts}
          className="gap-2 text-xs"
          title="إعادة جلب الأعداد من قاعدة البيانات"
        >
          <RefreshCw size={13} className={loadingCounts ? "animate-spin" : ""} />
          تحديث
        </Button>
      </div>

      <div className="rounded-xl border border-border bg-muted/30 px-3 py-2 flex items-center gap-3 flex-wrap text-[11px]">
        <div className="flex items-center gap-1.5 text-muted-foreground">
          <Database size={12} className="text-primary" />
          <span>المصدر: قاعدة البيانات (مباشر)</span>
        </div>
        <span className="text-muted-foreground">•</span>
        <span className="font-bold text-foreground">{totalStudents} طالب</span>
        <span className="text-muted-foreground">•</span>
        <span className="font-bold text-foreground">{totalRepeats} تكرار إجمالي</span>
        <span className="text-muted-foreground">•</span>
        <span className="font-bold text-success">{sendableCount} قابل للإرسال</span>
        {loadingCounts && (
          <>
            <span className="text-muted-foreground">•</span>
            <span className="text-primary inline-flex items-center gap-1"><RefreshCw size={11} className="animate-spin" /> جاري الجلب…</span>
          </>
        )}
      </div>

      {items.length === 0 ? (
        <div className="text-center py-8 rounded-xl border border-border bg-card">
          <TrendingUp size={28} className="mx-auto text-muted-foreground/30 mb-2" />
          <p className="text-xs text-muted-foreground">لا يوجد طلاب بتكرار ≥ {MIN_REPEAT_COUNT} في قاعدة البيانات</p>
        </div>
      ) : (
        <>
          <div className="flex gap-2">
            <Button onClick={handleSendAll} disabled={sending || selectedItems.length === 0 || !apiToken} className="gap-2 text-xs">
              {sending ? <RefreshCw size={14} className="animate-spin" /> : <Send size={14} />}
              {sending ? `جاري... (${sentCount}/${selectedItems.length})` : `إرسال (${selectedItems.length})`}
            </Button>
          </div>

          <div className="rounded-xl border border-border bg-card overflow-hidden">
            <div className="flex items-center gap-3 px-4 py-3 border-b border-border bg-muted/30">
              <Checkbox checked={items.length > 0 && items.every(i => i.selected)} onCheckedChange={c => toggleAll(!!c)} />
              <span className="text-xs font-bold">تحديد الكل</span>
            </div>
            <div className="divide-y divide-border max-h-[400px] overflow-y-auto">
              {items.map((item, idx) => (
                <div key={item.student.id} className={cn("flex items-start gap-3 px-4 py-3", !item.selected && "opacity-50")}>
                  <Checkbox checked={item.selected} onCheckedChange={() => toggleItem(idx)} disabled={sending || !item.phone} className="mt-1" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-bold text-foreground">{item.student.name}</span>
                      <span className="bg-primary/10 text-primary text-[10px] px-2 py-0.5 rounded-full font-bold">{item.count} مرة</span>
                      <span className="bg-muted text-muted-foreground text-[10px] px-2 py-0.5 rounded-full">
                        {item.student.grade} - {item.student.section}
                      </span>
                      {!item.phone && (
                        <span className="bg-destructive/10 text-destructive text-[10px] px-2 py-0.5 rounded-full font-bold">
                          رقم ولي الأمر غير صالح
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-1 mt-1">
                      <Phone size={10} className="text-muted-foreground" />
                      <span className="text-[10px] text-muted-foreground font-mono" dir="ltr">{item.phone ? `+${item.phone}` : "—"}</span>
                    </div>
                    {editingIdx === idx ? (
                      <div className="mt-2 space-y-1">
                        <Input value={item.editedMessage ?? item.message} onChange={e => updateMessage(idx, e.target.value)} className="text-xs" dir="rtl" maxLength={70} />
                        <Button variant="ghost" size="sm" onClick={() => setEditingIdx(null)} className="text-xs">حفظ</Button>
                      </div>
                    ) : (
                      <div className="mt-1 flex items-start gap-1">
                        <p className="text-[10px] text-foreground/80 bg-muted/30 rounded p-2 whitespace-pre-wrap flex-1">{item.editedMessage || item.message}</p>
                        <Button variant="ghost" size="icon" className="h-6 w-6 shrink-0" onClick={() => setEditingIdx(idx)}>
                          <Edit3 size={10} className="text-muted-foreground" />
                        </Button>
                      </div>
                    )}
                    <p className="text-[9px] text-muted-foreground mt-0.5">{(item.editedMessage || item.message).length} حرف</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export default SmsFrequencyTab;
