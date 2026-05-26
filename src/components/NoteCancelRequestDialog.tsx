import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { StudentAction, ACTION_LABELS } from "@/types/school";
import { ThumbsUp, Send } from "lucide-react";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  action: StudentAction | null;
  onSuccess: () => void;
}

const NoteCancelRequestDialog = ({ open, onOpenChange, action, onSuccess }: Props) => {
  const { user, profile } = useAuth();
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (!action || !user || !profile || !reason.trim()) {
      toast({ title: "يرجى كتابة سبب الإلغاء", variant: "destructive" });
      return;
    }
    setSubmitting(true);
    try {
      const { error } = await supabase.from("note_cancel_requests" as any).insert({
        action_id: action.id,
        student_id: action.studentId,
        student_name: action.studentName,
        grade: action.grade,
        section: action.section,
        action_type: action.type,
        action_date: action.date,
        reason: reason.trim(),
        requested_by: user.id,
        requested_by_name: profile.full_name,
        requested_by_role: profile.role_title,
      } as any);
      if (error) throw error;

      // Notify principal
      const { data: principals } = await supabase.from("profiles")
        .select("user_id").eq("is_principal", true).eq("approved", true);
      if (principals?.length) {
        await Promise.all(principals.map((p: any) =>
          supabase.from("notifications").insert({
            user_id: p.user_id,
            title: `طلب إلغاء ملاحظة - ${action.studentName}`,
            body: `${profile.full_name} يطلب إلغاء ملاحظة (${ACTION_LABELS[action.type] || action.type}) عن ${action.studentName}. السبب: ${reason.trim()}`,
            type: "cancel_request",
          } as any)
        ));
      }

      toast({ title: "✅ تم إرسال طلب الإلغاء للمدير" });
      setReason("");
      onOpenChange(false);
      onSuccess();
    } catch (err: any) {
      toast({ title: "فشل إرسال الطلب", description: err.message, variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  if (!action) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-primary">
            <ThumbsUp size={18} /> طلب إلغاء ملاحظة صفية
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4 mt-1">
          <div className="bg-primary/5 border border-primary/15 rounded-lg p-3 space-y-1 text-sm">
            <p><strong>الطالب:</strong> {action.studentName}</p>
            <p><strong>النوع:</strong> {ACTION_LABELS[action.type] || action.type}</p>
            <p><strong>التاريخ:</strong> {action.date}</p>
            {action.description && <p><strong>التفاصيل:</strong> {action.description}</p>}
          </div>
          <div className="space-y-1.5">
            <Label className="text-[11px] font-bold text-muted-foreground">سبب طلب الإلغاء (تحسّن سلوك الطالب)</Label>
            <Textarea
              placeholder="مثال: تحسّن سلوك الطالب بشكل ملحوظ والتزم بالحصص..."
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
              className="text-sm"
            />
          </div>
          <p className="text-[10px] text-muted-foreground leading-relaxed">
            سيتم إرسال الطلب لمدير المدرسة للموافقة. إلغاء الملاحظة يُعد تعزيزاً للسلوك الإيجابي.
          </p>
          <Button onClick={handleSubmit} disabled={submitting || !reason.trim()} className="w-full gap-2 h-10 font-bold">
            <Send size={15} />
            {submitting ? "جارٍ الإرسال..." : "إرسال الطلب للمدير"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default NoteCancelRequestDialog;
