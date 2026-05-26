import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/hooks/use-toast";
import { ACTION_LABELS } from "@/types/school";
import { CheckCircle, XCircle, ThumbsUp, Clock, MessageSquare } from "lucide-react";

const CLASS_NOTE_TYPES = ["class_late", "class_escape", "class_chaos", "no_homework", "sleeping", "class_note"];

interface DayStudentNote {
  student_id: string;
  student_name: string;
  count: number;
}

interface CancelRequest {
  id: string;
  action_id: string;
  student_name: string;
  grade: string;
  section: number;
  action_type: string;
  action_date: string;
  reason: string;
  requested_by_name: string;
  requested_by_role: string;
  status: string;
  review_note: string | null;
  created_at: string;
}

const PrincipalCancelRequests = () => {
  const { profile } = useAuth();
  const [requests, setRequests] = useState<CancelRequest[]>([]);
  const [reviewNotes, setReviewNotes] = useState<Record<string, string>>({});
  const [processing, setProcessing] = useState<string | null>(null);
  const [bulkDate, setBulkDate] = useState(new Date().toISOString().split("T")[0]);
  const [dayStudentNotes, setDayStudentNotes] = useState<DayStudentNote[]>([]);
  const [selectedStudentIds, setSelectedStudentIds] = useState<Set<string>>(new Set());
  const [bulkLoading, setBulkLoading] = useState(false);

  const fetchRequests = useCallback(async () => {
    const { data, error } = await supabase
      .from("note_cancel_requests" as any)
      .select("*")
      .order("created_at", { ascending: false })
      .limit(50);
    if (!error && data) setRequests(data as any);
  }, []);

  useEffect(() => {
    fetchRequests();
    const ch = supabase.channel("cancel-requests-watch")
      .on("postgres_changes", { event: "*", schema: "public", table: "note_cancel_requests" }, fetchRequests)
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [fetchRequests]);

  const fetchDayStudentNotes = useCallback(async () => {
    if (!profile?.is_principal || !bulkDate) return;
    const { data, error } = await supabase
      .from("student_actions")
      .select("student_id, student_name")
      .eq("date", bulkDate)
      .in("type", CLASS_NOTE_TYPES)
      .limit(2000);

    if (error || !data) {
      setDayStudentNotes([]);
      return;
    }

    const map = new Map<string, DayStudentNote>();
    for (const row of data as Array<{ student_id: string; student_name: string }>) {
      const existing = map.get(row.student_id);
      if (existing) {
        existing.count += 1;
      } else {
        map.set(row.student_id, {
          student_id: row.student_id,
          student_name: row.student_name,
          count: 1,
        });
      }
    }

    const notes = Array.from(map.values()).sort((a, b) => b.count - a.count || a.student_name.localeCompare(b.student_name, "ar"));
    setDayStudentNotes(notes);
    setSelectedStudentIds(new Set());
  }, [bulkDate, profile?.is_principal]);

  useEffect(() => {
    fetchDayStudentNotes();
  }, [fetchDayStudentNotes]);

  const toggleStudentSelection = (studentId: string) => {
    setSelectedStudentIds((prev) => {
      const next = new Set(prev);
      if (next.has(studentId)) {
        next.delete(studentId);
      } else {
        next.add(studentId);
      }
      return next;
    });
  };

  const handleBulkClassNotesReset = async (mode: "day" | "selected") => {
    if (!profile?.is_principal) return;
    if (mode === "selected" && selectedStudentIds.size === 0) {
      toast({ title: "اختر طالبًا واحدًا على الأقل", variant: "destructive" });
      return;
    }

    setBulkLoading(true);
    try {
      let query = supabase
        .from("student_actions")
        .delete()
        .eq("date", bulkDate)
        .in("type", CLASS_NOTE_TYPES);

      if (mode === "selected") {
        query = query.in("student_id", Array.from(selectedStudentIds));
      }

      const { data, error } = await query.select("id");
      if (error) throw error;

      const removedCount = (data || []).length;
      toast({ title: "✅ تم التنفيذ", description: `تم حذف ${removedCount} ملاحظة صفية` });
      await Promise.all([fetchRequests(), fetchDayStudentNotes()]);
    } catch (err: any) {
      toast({ title: "خطأ في التصفير", description: err.message, variant: "destructive" });
    } finally {
      setBulkLoading(false);
    }
  };

  const handleReview = async (req: CancelRequest, approved: boolean) => {
    if (!profile) return;
    setProcessing(req.id);
    try {
      const newStatus = approved ? "approved" : "rejected";
      const { error } = await supabase.from("note_cancel_requests" as any)
        .update({
          status: newStatus,
          reviewed_by: profile.user_id,
          reviewed_by_name: profile.full_name,
          review_note: reviewNotes[req.id] || "",
          reviewed_at: new Date().toISOString(),
        } as any)
        .eq("id", req.id);
      if (error) throw error;

      // If approved, delete the original action
      if (approved) {
        await supabase.from("student_actions").delete().eq("id", req.action_id);
      }

      // Notify the requesting teacher
      const { data: requester } = await supabase.from("profiles")
        .select("user_id").eq("full_name", req.requested_by_name).limit(1);
      if (requester?.[0]) {
        await supabase.from("notifications").insert({
          user_id: (requester[0] as any).user_id,
          title: approved
            ? `✅ تمت الموافقة على إلغاء ملاحظة ${req.student_name}`
            : `❌ رُفض طلب إلغاء ملاحظة ${req.student_name}`,
          body: approved
            ? `وافق المدير على إلغاء الملاحظة الصفية عن ${req.student_name} — تعزيز للسلوك الإيجابي`
            : `رفض المدير طلب إلغاء الملاحظة. ${reviewNotes[req.id] || ""}`,
          type: "cancel_request",
        } as any);
      }

      toast({ title: approved ? "✅ تم إلغاء الملاحظة وتعزيز السلوك" : "تم رفض الطلب" });
      fetchRequests();
    } catch (err: any) {
      toast({ title: "خطأ", description: err.message, variant: "destructive" });
    } finally {
      setProcessing(null);
    }
  };

  const pending = requests.filter(r => r.status === "pending");
  const reviewed = requests.filter(r => r.status !== "pending");

  if (requests.length === 0) return null;

  return (
    <div className="bg-card rounded-xl border border-border/50 overflow-hidden">
      <div className="px-5 py-3.5 border-b border-border/50 flex items-center gap-2 bg-primary/5">
        <ThumbsUp size={16} className="text-primary" />
        <h2 className="text-sm font-bold text-foreground">طلبات إلغاء ملاحظات صفية</h2>
        {pending.length > 0 && (
          <span className="text-[10px] bg-destructive text-destructive-foreground px-2 py-0.5 rounded-full font-bold">
            {pending.length} بانتظار المراجعة
          </span>
        )}
      </div>

      <div className="p-4 border-b border-border/40 bg-muted/10 space-y-3">
        <h3 className="text-xs font-bold text-foreground">إدارة الملاحظات الصفية (للمدير فقط)</h3>
        <div className="flex flex-wrap items-center gap-2">
          <Input
            type="date"
            value={bulkDate}
            onChange={(e) => setBulkDate(e.target.value)}
            className="w-[180px] h-9 text-xs"
          />
          <Button
            size="sm"
            variant="outline"
            className="h-9 text-xs"
            onClick={() => handleBulkClassNotesReset("day")}
            disabled={bulkLoading}
          >
            تصفير ملاحظات اليوم كاملًا
          </Button>
          <Button
            size="sm"
            className="h-9 text-xs"
            onClick={() => handleBulkClassNotesReset("selected")}
            disabled={bulkLoading || selectedStudentIds.size === 0}
          >
            حذف ملاحظات الطلاب المحددين
          </Button>
        </div>

        {dayStudentNotes.length > 0 ? (
          <div className="max-h-44 overflow-y-auto rounded-lg border border-border/40 divide-y divide-border/30 bg-background">
            {dayStudentNotes.map((item) => (
              <div key={item.student_id} className="px-3 py-2 flex items-center justify-between gap-3">
                <div className="flex items-center gap-2 min-w-0">
                  <Checkbox
                    checked={selectedStudentIds.has(item.student_id)}
                    onCheckedChange={() => toggleStudentSelection(item.student_id)}
                  />
                  <span className="text-xs font-semibold text-foreground truncate">{item.student_name}</span>
                </div>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-primary/10 text-primary font-bold">{item.count} ملاحظة</span>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-[11px] text-muted-foreground">لا توجد ملاحظات صفية في التاريخ المحدد.</p>
        )}
      </div>

      {pending.length > 0 && (
        <div className="divide-y divide-border/30">
          {pending.map((req) => (
            <div key={req.id} className="p-4 space-y-3 bg-warning/5">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Clock size={14} className="text-warning shrink-0" />
                    <span className="font-bold text-sm text-foreground">{req.student_name}</span>
                    <span className="text-[10px] bg-muted/50 text-muted-foreground px-2 py-0.5 rounded-full">
                      {ACTION_LABELS[req.action_type as keyof typeof ACTION_LABELS] || req.action_type}
                    </span>
                  </div>
                  <p className="text-[11px] text-muted-foreground mt-1">
                    {req.grade} • شعبة {req.section} • {req.action_date}
                  </p>
                  <div className="mt-2 bg-muted/20 rounded-lg p-2.5 border border-border/30">
                    <p className="text-[10px] font-bold text-muted-foreground mb-0.5">سبب الإلغاء:</p>
                    <p className="text-xs text-foreground leading-relaxed">{req.reason}</p>
                  </div>
                  <p className="text-[10px] text-muted-foreground mt-1.5">
                    <MessageSquare size={10} className="inline ml-1" />
                    طلب من: <strong>{req.requested_by_name}</strong> ({req.requested_by_role})
                    — {new Date(req.created_at).toLocaleDateString("ar-SA")}
                  </p>
                </div>
              </div>
              <div className="space-y-2">
                <Textarea
                  placeholder="ملاحظة المدير (اختياري)..."
                  value={reviewNotes[req.id] || ""}
                  onChange={(e) => setReviewNotes(prev => ({ ...prev, [req.id]: e.target.value }))}
                  rows={2}
                  className="text-xs"
                />
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    className="gap-1.5 h-8 text-xs flex-1"
                    disabled={processing === req.id}
                    onClick={() => handleReview(req, true)}
                  >
                    <CheckCircle size={13} /> موافقة وتعزيز السلوك
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-1.5 h-8 text-xs text-destructive border-destructive/30 hover:bg-destructive/5"
                    disabled={processing === req.id}
                    onClick={() => handleReview(req, false)}
                  >
                    <XCircle size={13} /> رفض
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {reviewed.length > 0 && (
        <div className="border-t border-border/30">
          <div className="px-4 py-2 bg-muted/20">
            <p className="text-[11px] font-bold text-muted-foreground">الطلبات السابقة ({reviewed.length})</p>
          </div>
          <div className="divide-y divide-border/20 max-h-[200px] overflow-y-auto">
            {reviewed.map((req) => (
              <div key={req.id} className="px-4 py-2.5 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    {req.status === "approved" ? (
                      <CheckCircle size={13} className="text-emerald-600 shrink-0" />
                    ) : (
                      <XCircle size={13} className="text-destructive shrink-0" />
                    )}
                    <span className="text-xs font-semibold text-foreground">{req.student_name}</span>
                    <span className="text-[10px] text-muted-foreground">— {req.requested_by_name}</span>
                  </div>
                  {req.review_note && (
                    <p className="text-[10px] text-muted-foreground mt-0.5 mr-5">{req.review_note}</p>
                  )}
                </div>
                <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold border whitespace-nowrap ${
                  req.status === "approved"
                    ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                    : "bg-red-50 text-red-700 border-red-200"
                }`}>
                  {req.status === "approved" ? "تم الإلغاء ✓" : "مرفوض"}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default PrincipalCancelRequests;
