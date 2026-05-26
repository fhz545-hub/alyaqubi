import { useMemo, useState, useEffect } from "react";
import { Student, StudentAction, ActionType } from "@/types/school";
import { formatSaudiPhone, isValidSaudiPhone } from "@/utils/whatsapp";
import { ensureSmsMaxLength, EXIT_TEMPLATE, getStudentFirstName, READY_TEMPLATES } from "@/utils/smsTemplates";
import { useAuth } from "@/contexts/AuthContext";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { Send, RefreshCw, Phone, Bell, LogOut, Edit3 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { toast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { SmsArchiveEntry } from "./SmsArchive";

interface AlertItem {
  student: Student;
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

const SmsAlertsTab = ({ actions, students, apiToken, senderName, onArchiveAdd }: Props) => {
  const { profile } = useAuth();
  const [alertType, setAlertType] = useState("exit");
  const [sending, setSending] = useState(false);
  const [sentCount, setSentCount] = useState(0);
  const [editingIdx, setEditingIdx] = useState<number | null>(null);

  const studentsMap = useMemo(() => new Map(students.map(s => [s.id, s])), [students]);

  // Exit alerts: students with "permission" action today
  const exitItems = useMemo((): AlertItem[] => {
    const seen = new Set<string>();
    const items: AlertItem[] = [];
    for (const a of actions) {
      if (a.type !== "permission") continue;
      if (seen.has(a.studentId)) continue;
      seen.add(a.studentId);
      const student = studentsMap.get(a.studentId);
      if (!student || !isValidSaudiPhone(student.guardianPhone)) continue;
      items.push({
        student,
        phone: formatSaudiPhone(student.guardianPhone),
        message: EXIT_TEMPLATE(getStudentFirstName(student.name)),
        selected: true,
      });
    }
    return items;
  }, [actions, studentsMap]);

  const items = alertType === "exit" ? exitItems : [];
  const [localItems, setLocalItems] = useState<AlertItem[]>(items);
  useEffect(() => { setLocalItems(items); setSentCount(0); }, [items]);

  const selectedItems = localItems.filter(i => i.selected);

  const toggleItem = (idx: number) => {
    setLocalItems(prev => prev.map((item, i) => i === idx ? { ...item, selected: !item.selected } : item));
  };

  const updateMessage = (idx: number, newMsg: string) => {
    setLocalItems(prev => prev.map((item, i) => i === idx ? { ...item, editedMessage: ensureSmsMaxLength(newMsg) } : item));
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

    for (let i = 0; i < localItems.length; i++) {
      if (!localItems[i].selected) continue;
      const msg = ensureSmsMaxLength(localItems[i].editedMessage || localItems[i].message);
      const ok = await sendDirectSms(localItems[i].phone, msg);
      if (ok) { sent++; setSentCount(sent); }
      archiveEntries.push({
        id: `${Date.now()}-alert-${i}`,
        studentName: localItems[i].student.name,
        phone: localItems[i].phone,
        type: "permission" as ActionType,
        message: msg,
        sentAt: new Date().toISOString(),
        success: ok,
        sentByName: profile?.full_name || "",
        sentByRole: profile?.role_title || "",
      });
      if (i < localItems.length - 1) await new Promise(r => setTimeout(r, 500));
    }

    setSending(false);
    onArchiveAdd(archiveEntries);
    toast({ title: `تم إرسال ${sent} من ${selectedItems.length} تنبيه` });
  };

  return (
    <div className="space-y-4">
      <Tabs value={alertType} onValueChange={setAlertType} dir="rtl">
        <TabsList className="w-full grid grid-cols-2 h-auto p-1">
          <TabsTrigger value="exit" className="gap-1 text-xs py-2">
            <LogOut size={12} /> تنبيه خروج
          </TabsTrigger>
          <TabsTrigger value="general" className="gap-1 text-xs py-2">
            <Bell size={12} /> تنبيه عام
          </TabsTrigger>
        </TabsList>

        <TabsContent value="exit" className="mt-3">
          {localItems.length === 0 ? (
            <div className="text-center py-8 rounded-xl border border-border bg-card">
              <LogOut size={28} className="mx-auto text-muted-foreground/30 mb-2" />
              <p className="text-xs text-muted-foreground">لا يوجد مستأذنون اليوم</p>
            </div>
          ) : (
            <>
              <Button onClick={handleSendAll} disabled={sending || selectedItems.length === 0} className="gap-2 text-xs mb-3">
                {sending ? <RefreshCw size={14} className="animate-spin" /> : <Send size={14} />}
                {sending ? `جاري... (${sentCount}/${selectedItems.length})` : `إرسال تنبيه (${selectedItems.length})`}
              </Button>
              <div className="rounded-xl border border-border bg-card overflow-hidden divide-y divide-border max-h-[400px] overflow-y-auto">
                {localItems.map((item, idx) => (
                  <div key={item.student.id} className={cn("flex items-start gap-3 px-4 py-3", !item.selected && "opacity-50")}>
                    <Checkbox checked={item.selected} onCheckedChange={() => toggleItem(idx)} disabled={sending} className="mt-1" />
                    <div className="flex-1 min-w-0">
                      <span className="text-sm font-bold text-foreground">{item.student.name}</span>
                      <div className="flex items-center gap-1 mt-1">
                        <Phone size={10} className="text-muted-foreground" />
                        <span className="text-[10px] font-mono text-muted-foreground" dir="ltr">+{item.phone}</span>
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
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </TabsContent>

        <TabsContent value="general" className="mt-3">
          <div className="text-center py-8 rounded-xl border border-border bg-card">
            <Bell size={28} className="mx-auto text-muted-foreground/30 mb-2" />
            <p className="text-xs text-muted-foreground">استخدم قسم "رسائل عامة" لإرسال تنبيهات جماعية</p>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default SmsAlertsTab;
