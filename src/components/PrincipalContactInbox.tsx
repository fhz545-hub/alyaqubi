import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Inbox, Send, MessageSquare, Crown, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";

interface ContactMessage {
  id: string;
  sender_id: string;
  sender_name: string;
  sender_role: string;
  message_text: string;
  reply_text: string | null;
  created_at: string;
  replied_at: string | null;
  status: string;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const PrincipalContactInbox = ({ open, onOpenChange }: Props) => {
  const { profile } = useAuth();
  const [messages, setMessages] = useState<ContactMessage[]>([]);
  const [replyDrafts, setReplyDrafts] = useState<Record<string, string>>({});
  const [savingId, setSavingId] = useState<string | null>(null);
  const [filter, setFilter] = useState<"pending" | "all">("pending");

  const load = async () => {
    if (!profile?.is_principal) return;
    const { data } = await supabase
      .from("messages")
      .select("id, sender_id, sender_name, sender_role, message_text, reply_text, created_at, replied_at, status")
      .eq("message_type", "guide_contact")
      .eq("recipient_id", profile.user_id)
      .order("created_at", { ascending: false })
      .limit(100);
    setMessages((data || []) as ContactMessage[]);
  };

  useEffect(() => {
    if (open) load();
  }, [open]);

  // Realtime
  useEffect(() => {
    if (!open || !profile?.is_principal) return;
    const channel = supabase
      .channel(`principal-contact-inbox`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "messages", filter: `recipient_id=eq.${profile.user_id}` },
        () => load()
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [open, profile?.user_id, profile?.is_principal]);

  const sendReply = async (msg: ContactMessage) => {
    const text = (replyDrafts[msg.id] || "").trim();
    if (!text) {
      toast.error("اكتب نص الرد أولاً");
      return;
    }
    setSavingId(msg.id);
    const { error } = await supabase
      .from("messages")
      .update({
        reply_text: text,
        replied_at: new Date().toISOString(),
        status: "replied",
      } as any)
      .eq("id", msg.id);

    if (error) {
      console.error(error);
      toast.error("تعذّر حفظ الرد");
      setSavingId(null);
      return;
    }

    // Notify the sender
    await supabase.from("notifications").insert({
      user_id: msg.sender_id,
      title: `رد من مدير المدرسة على رسالتك`,
      body: text.slice(0, 140),
      type: "guide_contact_reply",
      related_id: msg.id,
    } as any);

    toast.success("تم إرسال الرد وإشعار المرسل");
    setReplyDrafts((p) => ({ ...p, [msg.id]: "" }));
    setSavingId(null);
    load();
  };

  const formatTime = (iso: string) =>
    new Date(iso).toLocaleString("ar", {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });

  const filtered = messages.filter((m) => (filter === "pending" ? !m.reply_text : true));
  const pendingCount = messages.filter((m) => !m.reply_text).length;

  if (!profile?.is_principal) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto p-0" dir="rtl">
        <div className="bg-gradient-to-l from-primary/10 via-primary/5 to-transparent p-5 border-b sticky top-0 z-10 bg-background/95 backdrop-blur">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base">
              <div className="w-9 h-9 rounded-xl bg-primary text-primary-foreground flex items-center justify-center shadow">
                <Inbox size={18} />
              </div>
              <div className="flex flex-col">
                <span className="font-bold">صندوق رسائل المدير</span>
                <span className="text-[11px] font-normal text-muted-foreground">
                  رسائل المعلمين والمستخدمين عبر دليل الاستخدام
                </span>
              </div>
            </DialogTitle>
          </DialogHeader>

          <div className="mt-3 flex items-center gap-2">
            <button
              onClick={() => setFilter("pending")}
              className={`text-[11px] px-3 py-1.5 rounded-full border font-semibold transition-colors ${
                filter === "pending"
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-background border-border hover:bg-muted"
              }`}
            >
              بانتظار الرد ({pendingCount})
            </button>
            <button
              onClick={() => setFilter("all")}
              className={`text-[11px] px-3 py-1.5 rounded-full border font-semibold transition-colors ${
                filter === "all"
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-background border-border hover:bg-muted"
              }`}
            >
              جميع الرسائل ({messages.length})
            </button>
          </div>
        </div>

        <div className="p-4 sm:p-5 space-y-3">
          {filtered.length === 0 ? (
            <div className="text-center py-10 text-muted-foreground">
              <MessageSquare size={32} className="mx-auto mb-2 opacity-40" />
              <p className="text-sm">
                {filter === "pending" ? "لا توجد رسائل بانتظار الرد" : "لا توجد رسائل"}
              </p>
            </div>
          ) : (
            filtered.map((msg) => {
              const cleanText = msg.message_text.replace(/^\[[^\]]+\]\s*/, "");
              const typeMatch = msg.message_text.match(/^\[([^\]]+)\]/);
              const typeLabel = typeMatch ? typeMatch[1] : null;
              const replied = Boolean(msg.reply_text);

              return (
                <div
                  key={msg.id}
                  className={`rounded-xl border p-3.5 ${
                    replied ? "bg-success/5 border-success/20" : "bg-card border-primary/20"
                  }`}
                >
                  <div className="flex items-start justify-between gap-2 mb-2 flex-wrap">
                    <div className="flex items-center gap-2 min-w-0">
                      <div className="w-8 h-8 rounded-full bg-primary/10 text-primary flex items-center justify-center shrink-0">
                        <Crown size={14} />
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-bold text-foreground truncate">{msg.sender_name}</p>
                        <p className="text-[10px] text-muted-foreground">{msg.sender_role}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 flex-wrap">
                      {typeLabel && (
                        <span className="text-[10px] font-bold bg-primary/10 text-primary rounded-full px-2 py-0.5">
                          {typeLabel}
                        </span>
                      )}
                      {replied && (
                        <span className="text-[10px] font-bold bg-success/15 text-success rounded-full px-2 py-0.5 flex items-center gap-1">
                          <CheckCircle2 size={10} /> تم الرد
                        </span>
                      )}
                      <span className="text-[10px] text-muted-foreground">{formatTime(msg.created_at)}</span>
                    </div>
                  </div>

                  <div className="rounded-lg bg-background border border-border/50 p-2.5 mb-2">
                    <p className="text-[12.5px] text-foreground leading-relaxed whitespace-pre-wrap break-words">
                      {cleanText}
                    </p>
                  </div>

                  {replied ? (
                    <div className="rounded-lg bg-success/10 border border-success/30 p-2.5">
                      <div className="flex items-center gap-1.5 mb-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-success" />
                        <span className="text-[10px] font-bold text-success">ردك الرسمي</span>
                        {msg.replied_at && (
                          <span className="text-[10px] text-muted-foreground mr-auto">
                            {formatTime(msg.replied_at)}
                          </span>
                        )}
                      </div>
                      <p className="text-[12px] text-foreground leading-relaxed whitespace-pre-wrap break-words">
                        {msg.reply_text}
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <Textarea
                        value={replyDrafts[msg.id] || ""}
                        onChange={(e) =>
                          setReplyDrafts((p) => ({ ...p, [msg.id]: e.target.value }))
                        }
                        placeholder="اكتب ردك التربوي الرسمي على المعلم..."
                        className="min-h-[80px] text-sm resize-none"
                        maxLength={500}
                      />
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] text-muted-foreground">
                          {(replyDrafts[msg.id] || "").length}/500
                        </span>
                        <Button
                          size="sm"
                          onClick={() => sendReply(msg)}
                          disabled={savingId === msg.id || !(replyDrafts[msg.id] || "").trim()}
                          className="gap-1.5"
                        >
                          <Send size={13} />
                          {savingId === msg.id ? "جاري الإرسال..." : "إرسال الرد"}
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default PrincipalContactInbox;
