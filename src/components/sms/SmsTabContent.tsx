import { useMemo, useState, useEffect, useCallback } from "react";
import { Student, ActionType, ACTION_LABELS, StudentAction } from "@/types/school";
import { formatSaudiPhone, isValidSaudiPhone } from "@/utils/whatsapp";
import { ensureSmsMaxLength, generateSmsTemplate, SmsTabKey } from "@/utils/smsTemplates";
import { useAuth } from "@/contexts/AuthContext";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Send, RefreshCw, Download, Phone, Users, Edit3, CheckCircle2 } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { SmsArchiveEntry } from "./SmsArchive";
import { supabase } from "@/integrations/supabase/client";

export interface SmsQueueItem {
  student: Student;
  action: StudentAction;
  phone: string;
  message: string;
  selected: boolean;
  editedMessage?: string;
  alreadySent?: boolean;
}

const CLASS_NOTE_TYPES = ["class_late", "class_escape", "class_chaos", "no_homework", "sleeping", "class_note"];

interface Props {
  tabKey: SmsTabKey;
  actions: StudentAction[];
  students: Student[];
  apiToken: string;
  senderName: string;
  onArchiveAdd: (entries: SmsArchiveEntry[]) => void;
}

const SmsTabContent = ({ tabKey, actions, students, apiToken, senderName, onArchiveAdd }: Props) => {
  const { profile } = useAuth();
  const [sending, setSending] = useState(false);
  const [sentCount, setSentCount] = useState(0);
  const [currentIndex, setCurrentIndex] = useState(-1);
  const [editingIdx, setEditingIdx] = useState<number | null>(null);
  const [sentLogKeys, setSentLogKeys] = useState<Set<string>>(new Set());

  const todayStr = new Date().toISOString().slice(0, 10);

  // Load sent log for today
  const loadSentLog = useCallback(async () => {
    const { data } = await supabase
      .from("sms_sent_log")
      .select("student_id, sms_type")
      .eq("sent_date", todayStr);
    if (data) {
      setSentLogKeys(new Set(data.map(r => `${r.student_id}-${r.sms_type}`)));
    }
  }, [todayStr]);

  useEffect(() => { loadSentLog(); }, [loadSentLog]);

  const studentsMap = useMemo(() => new Map(students.map(s => [s.id, s])), [students]);

  const queueItems = useMemo((): SmsQueueItem[] => {
    const seen = new Set<string>();
    const items: SmsQueueItem[] = [];
    for (const action of actions) {
      if (tabKey === "class_notes") {
        if (!CLASS_NOTE_TYPES.includes(action.type)) continue;
      } else {
        if (action.type !== tabKey) continue;
      }
      if (action.description?.includes("بعذر") && !action.description?.includes("بدون عذر")) continue;

      const key = `${action.studentId}-${action.type}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const student = studentsMap.get(action.studentId);
      if (!student || !isValidSaudiPhone(student.guardianPhone)) continue;
      const phone = formatSaudiPhone(student.guardianPhone);
      const message = generateSmsTemplate(student, action.type as ActionType, {
        violationCategory: action.violationCategory,
        violationDegree: action.violationDegree,
      });
      const smsTypeKey = tabKey === "class_notes" ? "class_note" : tabKey;
      const alreadySent = sentLogKeys.has(`${action.studentId}-${smsTypeKey}`);
      items.push({ student, action, phone, message, selected: !alreadySent, alreadySent });
    }
    return items;
  }, [actions, tabKey, studentsMap, sentLogKeys]);

  const [smsItems, setSmsItems] = useState<SmsQueueItem[]>(queueItems);
  useEffect(() => { setSmsItems(queueItems); setSentCount(0); setCurrentIndex(-1); setSending(false); }, [queueItems]);

  const unsent = smsItems.filter(i => !i.alreadySent);
  const selectedItems = unsent.filter(i => i.selected);
  const sentItems = smsItems.filter(i => i.alreadySent);

  const toggleItem = (idx: number) => {
    if (smsItems[idx].alreadySent) return;
    setSmsItems(prev => prev.map((item, i) => i === idx ? { ...item, selected: !item.selected } : item));
  };

  const toggleAll = (checked: boolean) => {
    setSmsItems(prev => prev.map(item => item.alreadySent ? item : { ...item, selected: checked }));
  };

  const updateMessage = (idx: number, newMsg: string) => {
    setSmsItems(prev => prev.map((item, i) => i === idx ? { ...item, editedMessage: ensureSmsMaxLength(newMsg) } : item));
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

  const logSmsSent = async (studentId: string, smsType: string) => {
    await supabase.from("sms_sent_log").upsert({
      student_id: studentId,
      sms_type: smsType,
      sent_date: todayStr,
      sent_by: profile?.user_id || undefined,
    }, { onConflict: "student_id,sms_type,sent_date" });
  };

  const handleSendAll = async () => {
    if (!apiToken) { toast({ title: "التوكن غير مُعدّ", variant: "destructive" }); return; }
    if (selectedItems.length === 0) return;
    setSending(true);
    setSentCount(0);
    let sent = 0;
    const archiveEntries: SmsArchiveEntry[] = [];
    const smsTypeKey = (tabKey === "class_notes" ? "class_note" : tabKey) as string;

    for (let i = 0; i < smsItems.length; i++) {
      if (!smsItems[i].selected || smsItems[i].alreadySent) continue;
      setCurrentIndex(i);
      const msg = ensureSmsMaxLength(smsItems[i].editedMessage || smsItems[i].message);
      const ok = await sendDirectSms(smsItems[i].phone, msg);
      if (ok) {
        sent++;
        setSentCount(sent);
        await logSmsSent(smsItems[i].action.studentId, smsTypeKey);
      } else {
        toast({ title: `فشل إرسال لـ ${smsItems[i].student.name}`, variant: "destructive" });
      }
      archiveEntries.push({
        id: `${Date.now()}-${i}`,
        studentName: smsItems[i].student.name,
        phone: smsItems[i].phone,
        type: smsTypeKey as ActionType,
        message: msg,
        sentAt: new Date().toISOString(),
        success: ok,
        sentByName: profile?.full_name || "",
        sentByRole: profile?.role_title || "",
      });
      if (i < smsItems.length - 1) await new Promise(r => setTimeout(r, 500));
    }

    setSending(false);
    setCurrentIndex(-1);
    onArchiveAdd(archiveEntries);
    toast({ title: `تم إرسال ${sent} من ${selectedItems.length} رسالة` });
    // Reload sent log to update UI
    await loadSentLog();
  };

  const handleExportCsv = () => {
    if (selectedItems.length === 0) return;
    const header = "الرقم,اسم الطالب,النوع,رقم ولي الأمر,الرسالة";
    const rows = selectedItems.map((item, i) =>
      `${i + 1},"${item.student.name}","${ACTION_LABELS[item.action.type as ActionType] || item.action.type}","${item.phone}","${(item.editedMessage || item.message).replace(/"/g, '""')}"`
    );
    const csv = "\uFEFF" + header + "\n" + rows.join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `sms_${tabKey}_${todayStr}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast({ title: `تم تصدير ${selectedItems.length} رسالة` });
  };

  const invalidCount = useMemo(() => {
    const seen = new Set<string>();
    let count = 0;
    for (const action of actions) {
      if (tabKey === "class_notes") {
        if (!CLASS_NOTE_TYPES.includes(action.type)) continue;
      } else {
        if (action.type !== tabKey) continue;
      }
      const key = `${action.studentId}-${action.type}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const student = studentsMap.get(action.studentId);
      if (student && !isValidSaudiPhone(student.guardianPhone)) count++;
    }
    return count;
  }, [actions, tabKey, studentsMap]);

  if (smsItems.length === 0 && invalidCount === 0) {
    return (
      <div className="text-center py-12 rounded-xl border border-border bg-card">
        <Users size={36} className="mx-auto text-muted-foreground/30 mb-3" />
        <p className="text-sm text-muted-foreground">لا توجد سجلات لهذا القسم اليوم</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="rounded-xl border border-border bg-card p-3 text-center">
          <p className="text-xl font-bold text-primary">{smsItems.length}</p>
          <p className="text-[10px] text-muted-foreground">إجمالي الرسائل</p>
        </div>
        <div className="rounded-xl border border-border bg-card p-3 text-center">
          <p className="text-xl font-bold text-emerald-600">{sentItems.length}</p>
          <p className="text-[10px] text-muted-foreground">تم الإرسال ✓</p>
        </div>
        <div className="rounded-xl border border-border bg-card p-3 text-center">
          <p className="text-xl font-bold text-amber-600">{unsent.length}</p>
          <p className="text-[10px] text-muted-foreground">بانتظار الإرسال</p>
        </div>
        {invalidCount > 0 && (
          <div className="rounded-xl border border-border bg-card p-3 text-center">
            <p className="text-xl font-bold text-destructive">{invalidCount}</p>
            <p className="text-[10px] text-muted-foreground">رقم غير صالح</p>
          </div>
        )}
      </div>

      {unsent.length > 0 && (
        <div className="flex gap-2 flex-wrap">
          <Button onClick={handleSendAll} disabled={sending || selectedItems.length === 0 || !apiToken} className="gap-2">
            {sending ? <RefreshCw size={14} className="animate-spin" /> : <Send size={14} />}
            {sending ? `جاري... (${sentCount}/${selectedItems.length})` : `إرسال (${selectedItems.length})`}
          </Button>
          <Button variant="outline" onClick={handleExportCsv} disabled={selectedItems.length === 0} className="gap-2 text-xs">
            <Download size={14} /> CSV ({selectedItems.length})
          </Button>
        </div>
      )}

      {unsent.length === 0 && smsItems.length > 0 && (
        <div className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 dark:bg-emerald-950/20 dark:border-emerald-800 p-4">
          <CheckCircle2 size={20} className="text-emerald-600 shrink-0" />
          <p className="text-sm font-medium text-emerald-700 dark:text-emerald-400">تم إرسال جميع الرسائل لهذا اليوم بنجاح</p>
        </div>
      )}

      <div className="rounded-xl border border-border bg-card overflow-hidden">
        {unsent.length > 0 && (
          <div className="flex items-center gap-3 px-4 py-3 border-b border-border bg-muted/30">
            <Checkbox
              checked={unsent.length > 0 && unsent.every(i => i.selected)}
              onCheckedChange={c => toggleAll(!!c)}
            />
            <span className="text-xs font-bold text-foreground">تحديد الكل ({unsent.length})</span>
          </div>
        )}
        <div className="divide-y divide-border max-h-[400px] overflow-y-auto">
          {smsItems.map((item, idx) => (
            <div
              key={`${item.student.id}-${idx}`}
              className={cn(
                "flex items-start gap-3 px-4 py-3 transition-colors",
                item.alreadySent && "bg-emerald-50/50 dark:bg-emerald-950/10",
                sending && currentIndex === idx && "bg-primary/5",
                !item.selected && !item.alreadySent && "opacity-50"
              )}
            >
              {!item.alreadySent ? (
                <Checkbox checked={item.selected} onCheckedChange={() => toggleItem(idx)} disabled={sending} className="mt-1" />
              ) : (
                <CheckCircle2 size={18} className="text-emerald-600 mt-1 shrink-0" />
              )}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-bold text-foreground">{item.student.name}</span>
                  {item.alreadySent && (
                    <Badge variant="outline" className="text-[9px] border-emerald-300 text-emerald-700 dark:text-emerald-400 bg-emerald-100 dark:bg-emerald-900/30 gap-1">
                      <CheckCircle2 size={10} />
                      تم الإرسال
                    </Badge>
                  )}
                  <span className="text-[10px] text-muted-foreground">{item.student.grade} - فصل {item.student.section}</span>
                </div>
                <div className="flex items-center gap-1 mt-1">
                  <Phone size={10} className="text-muted-foreground" />
                  <span className="text-[10px] text-muted-foreground font-mono" dir="ltr">+{item.phone}</span>
                </div>
                {!item.alreadySent && editingIdx === idx ? (
                  <div className="mt-2 space-y-1">
                    <Input value={item.editedMessage ?? item.message} onChange={e => updateMessage(idx, e.target.value)} className="text-xs" dir="rtl" maxLength={70} />
                    <Button variant="ghost" size="sm" onClick={() => setEditingIdx(null)} className="text-xs">حفظ</Button>
                  </div>
                ) : (
                  <div className="mt-1 flex items-start gap-1">
                    <p className="text-[10px] text-foreground/80 leading-relaxed bg-muted/30 rounded p-2 whitespace-pre-wrap flex-1">
                      {item.editedMessage || item.message}
                    </p>
                    {!item.alreadySent && (
                      <Button variant="ghost" size="icon" className="h-6 w-6 shrink-0" onClick={() => setEditingIdx(idx)}>
                        <Edit3 size={10} className="text-muted-foreground" />
                      </Button>
                    )}
                  </div>
                )}
                <p className="text-[9px] text-muted-foreground mt-0.5">{(item.editedMessage || item.message).length} حرف</p>
              </div>
              {sending && currentIndex === idx && (
                <RefreshCw size={14} className="text-primary animate-spin mt-1 shrink-0" />
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default SmsTabContent;
