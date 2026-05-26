import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Bell, Send } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "@/hooks/use-toast";
import {
  ClassroomReferralPayload,
  ClassroomReferralStatus,
  getReferralStatusLabel,
  parseClassroomReferralPayload,
  REFERRAL_STATUS_CLASSES,
} from "@/utils/classroomReferral";

interface Notification {
  id: string;
  user_id: string;
  title: string;
  body: string;
  type: string;
  related_id: string | null;
  is_read: boolean;
  created_at: string;
}

interface ReferralMessage {
  id: string;
  sender_id: string;
  sender_name: string;
  sender_role: string;
  student_name: string;
  student_grade: string;
  status: string;
  reply_text: string | null;
  replied_at: string | null;
  message_text: string;
  payload: ClassroomReferralPayload | null;
}

const FOLLOWUP_OPTIONS: { value: ClassroomReferralStatus; label: string }[] = [
  { value: "under_vice_followup", label: "تحت متابعة الوكيل" },
  { value: "action_taken", label: "تم اتخاذ الإجراء النظامي" },
];

const NotificationBell = () => {
  const { user, profile } = useAuth();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [referralMessages, setReferralMessages] = useState<Record<string, ReferralMessage>>({});
  const [open, setOpen] = useState(false);
  const [followupOpen, setFollowupOpen] = useState(false);
  const [selectedReferral, setSelectedReferral] = useState<ReferralMessage | null>(null);
  const [followupStatus, setFollowupStatus] = useState<ClassroomReferralStatus>("under_vice_followup");
  const [followupText, setFollowupText] = useState("");
  const [savingFollowup, setSavingFollowup] = useState(false);

  const isVice = useMemo(
    () => Boolean(profile?.role_title?.includes("وكيل") && !profile?.is_principal),
    [profile?.role_title, profile?.is_principal]
  );

  const loadReferralMessages = async (items: Notification[]) => {
    const relatedIds = Array.from(
      new Set(
        items
          .filter((n) => (n.type === "class_referral" || n.type === "class_referral_update") && n.related_id)
          .map((n) => n.related_id as string)
      )
    );

    if (relatedIds.length === 0) {
      setReferralMessages({});
      return;
    }

    const { data } = await supabase
      .from("messages")
      .select("id, sender_id, sender_name, sender_role, student_name, student_grade, status, reply_text, replied_at, message_text")
      .in("id", relatedIds)
      .eq("message_type", "class_referral");

    if (!data) return;

    const map: Record<string, ReferralMessage> = {};
    for (const row of data as any[]) {
      map[row.id] = {
        id: row.id,
        sender_id: row.sender_id,
        sender_name: row.sender_name || "",
        sender_role: row.sender_role || "",
        student_name: row.student_name || "",
        student_grade: row.student_grade || "",
        status: row.status || "transferred_after_third_note",
        reply_text: row.reply_text,
        replied_at: row.replied_at,
        message_text: row.message_text || "",
        payload: parseClassroomReferralPayload(row.message_text, {
          studentName: row.student_name || "",
          grade: row.student_grade || "",
          teacherName: row.sender_name || "",
          teacherRole: row.sender_role || "",
        }),
      };
    }

    setReferralMessages(map);
  };

  const fetchNotifications = async () => {
    if (!user) return;
    const { data } = await supabase
      .from("notifications")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(20);

    const rows = (data || []) as Notification[];
    setNotifications(rows);
    await loadReferralMessages(rows);
  };

  useEffect(() => {
    fetchNotifications();
    const interval = setInterval(fetchNotifications, 15000);
    return () => clearInterval(interval);
  }, [user]);

  // Realtime
  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel("notifications-rt")
      .on("postgres_changes", {
        event: "INSERT",
        schema: "public",
        table: "notifications",
        filter: `user_id=eq.${user.id}`,
      }, (payload) => {
        const n = payload.new as Notification;
        setNotifications((prev) => [n, ...prev]);
        fetchNotifications();
        // Browser push notification
        if ("Notification" in window && Notification.permission === "granted") {
          try {
            const notif = new window.Notification(n.title, {
              body: n.body,
              icon: "/favicon.ico",
              tag: n.id,
              requireInteraction: n.type === "class_referral",
            });
            notif.onclick = () => {
              window.focus();
              setOpen(true);
              notif.close();
            };
          } catch { /* silent */ }
        }
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [user]);

  useEffect(() => {
    if (!user) return;

    const channel = supabase
      .channel(`referral-status-${user.id}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "messages", filter: "message_type=eq.class_referral" },
        () => fetchNotifications()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user]);

  const [permissionState, setPermissionState] = useState<string>(
    "Notification" in window ? Notification.permission : "denied"
  );

  // Request notification permission
  useEffect(() => {
    if ("Notification" in window && Notification.permission === "default") {
      Notification.requestPermission().then((result) => setPermissionState(result));
    }
  }, []);

  const requestPermission = async () => {
    if ("Notification" in window) {
      const result = await Notification.requestPermission();
      setPermissionState(result);
      if (result === "granted") {
        toast({ title: "✅ تم تفعيل إشعارات المتصفح بنجاح" });
      }
    }
  };

  const unreadCount = notifications.filter(n => !n.is_read).length;

  const markAllRead = async () => {
    if (!user) return;
    const unreadIds = notifications.filter((n) => !n.is_read).map((n) => n.id);
    if (unreadIds.length === 0) return;

    await Promise.all(
      unreadIds.map((id) =>
        supabase.from("notifications").update({ is_read: true } as any).eq("id", id)
      )
    );

    setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
  };

  const openFollowup = (message: ReferralMessage) => {
    setSelectedReferral(message);
    setFollowupStatus(message.status === "action_taken" ? "action_taken" : "under_vice_followup");
    setFollowupText(message.reply_text || "");
    setFollowupOpen(true);
  };

  const submitFollowup = async () => {
    if (!selectedReferral || !user || !profile) return;
    if (!followupText.trim()) {
      toast({ title: "يرجى كتابة الإجراء المتخذ", variant: "destructive" });
      return;
    }

    setSavingFollowup(true);
    const { error } = await supabase
      .from("messages")
      .update({
        status: followupStatus,
        reply_text: followupText.trim(),
        replied_at: new Date().toISOString(),
      } as any)
      .eq("id", selectedReferral.id);

    if (error) {
      setSavingFollowup(false);
      toast({ title: "تعذر تحديث حالة المتابعة", variant: "destructive" });
      return;
    }

    const { data: principalUsers } = await supabase
      .from("profiles")
      .select("user_id")
      .eq("is_principal", true)
      .eq("approved", true);

    const notifyUserIds = Array.from(
      new Set([selectedReferral.sender_id, ...(principalUsers || []).map((p: any) => p.user_id)].filter(Boolean))
    ).filter((id) => id !== user.id);

    const statusLabel = getReferralStatusLabel(followupStatus);

    await Promise.all(
      notifyUserIds.map((userId) =>
        supabase.from("notifications").insert({
          user_id: userId,
          related_id: selectedReferral.id,
          type: "class_referral_update",
          title: `متابعة حالة الطالب ${selectedReferral.payload?.studentName || selectedReferral.student_name}`,
          body: `${statusLabel}\nالإجراء: ${followupText.trim()}`,
        } as any)
      )
    );

    toast({ title: "✅ تم تحديث المتابعة وإشعار الإدارة" });
    setFollowupOpen(false);
    setSelectedReferral(null);
    setSavingFollowup(false);
    fetchNotifications();
  };

  const formatTime = (iso: string) => {
    const d = new Date(iso);
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const diffMin = Math.floor(diffMs / 60000);
    if (diffMin < 1) return "الآن";
    if (diffMin < 60) return `منذ ${diffMin} دقيقة`;
    const diffHr = Math.floor(diffMin / 60);
    if (diffHr < 24) return `منذ ${diffHr} ساعة`;
    return d.toLocaleDateString("ar-SA");
  };

  return (
    <>
      <button
        onClick={() => { setOpen(true); markAllRead(); }}
        className="relative p-2 rounded-lg hover:bg-sidebar-accent/50 transition-colors"
      >
        <Bell size={20} className="text-sidebar-foreground/70" />
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 w-5 h-5 rounded-full bg-destructive text-destructive-foreground text-[10px] font-bold flex items-center justify-center animate-pulse">
            {unreadCount}
          </span>
        )}
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <div className="flex items-center justify-between">
              <DialogTitle className="flex items-center gap-2">
                <Bell size={18} className="text-primary" />
                الإشعارات
              </DialogTitle>
              {permissionState !== "granted" && (
                <Button variant="outline" size="sm" className="text-[11px] h-7 gap-1" onClick={requestPermission}>
                  <Bell size={12} /> تفعيل التنبيهات
                </Button>
              )}
            </div>
          </DialogHeader>
          <div className="max-h-[60vh] overflow-y-auto space-y-1">
            {notifications.length === 0 ? (
              <p className="text-center text-muted-foreground text-sm py-8">لا توجد إشعارات</p>
            ) : (
              notifications.map(n => (
                <div
                  key={n.id}
                  className={`p-3 rounded-lg border transition-colors ${
                    n.is_read ? "border-border/30 bg-background" : "border-primary/30 bg-primary/5"
                  }`}
                >
                  <div className="flex items-center justify-between mb-1 gap-2">
                    <p className="text-xs font-bold text-foreground">{n.title}</p>
                    <span className="text-[10px] text-muted-foreground shrink-0">{formatTime(n.created_at)}</span>
                  </div>

                  {(n.type === "class_referral" || n.type === "class_referral_update") && n.related_id && referralMessages[n.related_id] ? (
                    <div className="mt-2 rounded-md border border-border/40 bg-muted/20 p-2.5 space-y-2">
                      {(() => {
                        const message = referralMessages[n.related_id as string];
                        const payload = message.payload;
                        return (
                          <>
                            <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
                              <p><span className="font-bold text-foreground">الطالب:</span> {payload?.studentName || message.student_name}</p>
                              <p><span className="font-bold text-foreground">الرقم:</span> {payload?.studentNumber || "-"}</p>
                              <p><span className="font-bold text-foreground">المعلم:</span> {payload?.teacherName || message.sender_name}</p>
                              <p><span className="font-bold text-foreground">الحصة:</span> {payload?.period || "-"}</p>
                              <p className="col-span-2"><span className="font-bold text-foreground">نوع الملاحظة:</span> {payload?.noteLabel || "ملاحظة صفية"}</p>
                              <p className="col-span-2"><span className="font-bold text-foreground">التاريخ:</span> {payload?.date || "-"} {payload?.time || ""}</p>
                            </div>

                            <div className="flex items-center justify-between gap-2 flex-wrap">
                              <span
                                className={`text-[10px] px-2 py-1 rounded-full border font-bold ${REFERRAL_STATUS_CLASSES[message.status] || "bg-muted text-muted-foreground border-border"}`}
                              >
                                {getReferralStatusLabel(message.status)}
                              </span>
                              {payload?.transferTrigger === "auto_third_note" && (
                                <span className="text-[10px] px-2 py-1 rounded-full bg-warning/10 text-warning border border-warning/30 font-semibold">
                                  تحويل تلقائي بعد الملاحظة الثالثة
                                </span>
                              )}
                            </div>

                            {message.reply_text && (
                              <p className="text-[11px] text-primary">
                                <span className="font-bold">الإجراء المنفذ:</span> {message.reply_text}
                              </p>
                            )}

                            {isVice && (
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-7 text-[11px] gap-1.5"
                                onClick={() => openFollowup(message)}
                              >
                                <Send size={12} /> تحديث المتابعة
                              </Button>
                            )}
                          </>
                        );
                      })()}
                    </div>
                  ) : (
                    n.body && <p className="text-xs text-muted-foreground">{n.body}</p>
                  )}
                </div>
              ))
            )}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={followupOpen} onOpenChange={setFollowupOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>متابعة حالة صفية محوّلة</DialogTitle>
          </DialogHeader>
          {selectedReferral && (
            <div className="space-y-3">
              <div className="rounded-lg border border-border/40 bg-muted/20 p-3 text-sm">
                <p className="font-semibold text-foreground">{selectedReferral.payload?.studentName || selectedReferral.student_name}</p>
                <p className="text-xs text-muted-foreground mt-1">
                  {selectedReferral.payload?.grade || selectedReferral.student_grade} • المعلم: {selectedReferral.payload?.teacherName || selectedReferral.sender_name}
                </p>
              </div>

              <div className="space-y-2">
                <Label className="text-xs font-semibold">حالة المتابعة</Label>
                <Select value={followupStatus} onValueChange={(v) => setFollowupStatus(v as ClassroomReferralStatus)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {FOLLOWUP_OPTIONS.map((option) => (
                      <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label className="text-xs font-semibold">الإجراء المتخذ</Label>
                <Textarea
                  value={followupText}
                  onChange={(e) => setFollowupText(e.target.value)}
                  rows={4}
                  placeholder="اكتب الإجراء النظامي الذي تم تنفيذه على الحالة..."
                />
              </div>

              <Button onClick={submitFollowup} disabled={savingFollowup} className="w-full">
                {savingFollowup ? "جارٍ حفظ المتابعة..." : "حفظ المتابعة وإشعار المدير والمعلم"}
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
};

export default NotificationBell;
