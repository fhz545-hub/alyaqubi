import { useState, useEffect, useMemo, useCallback } from "react";
import AppLayout from "@/components/AppLayout";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { toast } from "@/hooks/use-toast";
import {
  parseClassroomReferralPayload,
  getReferralStatusLabel,
  REFERRAL_STATUS_CLASSES,
  type ClassroomReferralPayload,
} from "@/utils/classroomReferral";
import {
  ClipboardList,
  CheckCircle,
  Clock,
  AlertTriangle,
  UserCheck,
  BarChart3,
  Send,
  Trash2,
} from "lucide-react";

interface ReferralRow {
  id: string;
  status: string;
  created_at: string;
  sender_name: string;
  sender_role: string;
  recipient_name: string;
  student_name: string | null;
  student_grade: string | null;
  message_text: string;
  reply_text: string | null;
  read_at: string | null;
  replied_at: string | null;
  payload: ClassroomReferralPayload | null;
}

const ReferralTrackingPage = () => {
  const { profile, user } = useAuth();
  const [referrals, setReferrals] = useState<ReferralRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [actionDialog, setActionDialog] = useState<ReferralRow | null>(null);
  const [actionText, setActionText] = useState("");
  const [newStatus, setNewStatus] = useState("under_vice_followup");
  const [saving, setSaving] = useState(false);
  const [deleteDate, setDeleteDate] = useState(new Date().toISOString().split("T")[0]);
  const [deleting, setDeleting] = useState(false);
  const isPrincipal = profile?.is_principal === true;

  const handleDeleteByDate = async () => {
    if (!isPrincipal) return;
    setDeleting(true);
    try {
      const targetDate = new Date(deleteDate);
      const startOfDay = new Date(targetDate); startOfDay.setHours(0, 0, 0, 0);
      const endOfDay = new Date(targetDate); endOfDay.setHours(23, 59, 59, 999);
      const { error } = await supabase
        .from("messages")
        .delete()
        .eq("message_type", "class_referral")
        .gte("created_at", startOfDay.toISOString())
        .lte("created_at", endOfDay.toISOString());
      if (error) throw error;
      toast({ title: `✅ تم حذف تحويلات يوم ${deleteDate}` });
      fetchReferrals();
    } catch (err: any) {
      toast({ title: "خطأ في الحذف", description: err.message, variant: "destructive" });
    } finally { setDeleting(false); }
  };

  const fetchReferrals = useCallback(async () => {
    const { data, error } = await supabase
      .from("messages")
      .select("id, status, created_at, sender_name, sender_role, recipient_name, student_name, student_grade, message_text, reply_text, read_at, replied_at")
      .eq("message_type", "class_referral")
      .order("created_at", { ascending: false })
      .limit(500);

    if (error) {
      console.error("Failed to fetch referrals:", error);
      return;
    }

    const rows: ReferralRow[] = (data || []).map((row: any) => ({
      ...row,
      payload: parseClassroomReferralPayload(row.message_text, {
        studentName: row.student_name || "",
        grade: row.student_grade || "",
        teacherName: row.sender_name || "",
        teacherRole: row.sender_role || "",
      }),
    }));

    setReferrals(rows);
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchReferrals();
  }, [fetchReferrals]);

  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel("referral-tracking-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "messages" }, (payload) => {
        const row = (payload.new || payload.old) as any;
        if (row?.message_type === "class_referral") fetchReferrals();
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [user, fetchReferrals]);

  const filtered = useMemo(() => {
    if (statusFilter === "all") return referrals;
    return referrals.filter((r) => r.status === statusFilter);
  }, [referrals, statusFilter]);

  const stats = useMemo(() => {
    const total = referrals.length;
    const pending = referrals.filter((r) => r.status === "transferred_after_third_note").length;
    const inProgress = referrals.filter((r) => r.status === "under_vice_followup").length;
    const done = referrals.filter((r) => r.status === "action_taken").length;
    const closureRate = total > 0 ? Math.round((done / total) * 100) : 0;
    return { total, pending, inProgress, done, closureRate };
  }, [referrals]);

  const viceStats = useMemo(() => {
    const map = new Map<string, { name: string; total: number; done: number }>();
    for (const r of referrals) {
      const name = r.recipient_name || "غير محدد";
      const existing = map.get(name) || { name, total: 0, done: 0 };
      existing.total += 1;
      if (r.status === "action_taken") existing.done += 1;
      map.set(name, existing);
    }
    return Array.from(map.values()).sort((a, b) => b.total - a.total);
  }, [referrals]);

  const handleAction = async () => {
    if (!actionDialog || !user || !profile) return;
    setSaving(true);

    const { error } = await supabase
      .from("messages")
      .update({
        status: newStatus,
        reply_text: actionText.trim() || null,
        replied_at: new Date().toISOString(),
      })
      .eq("id", actionDialog.id);

    if (error) {
      toast({ title: "فشل تحديث الحالة", variant: "destructive" });
      setSaving(false);
      return;
    }

    // Notify the teacher
    await supabase.from("notifications").insert({
      user_id: actionDialog.id, // will be overridden below
      title: `تحديث حالة التحويل - ${actionDialog.student_name || "طالب"}`,
      body: `قام ${profile.full_name} بتحديث الحالة إلى: ${getReferralStatusLabel(newStatus)}${actionText ? ` | الإجراء: ${actionText}` : ""}`,
      type: "referral_update",
    } as any).then(() => {});

    toast({ title: "✅ تم تحديث حالة التحويل بنجاح" });
    setActionDialog(null);
    setActionText("");
    setSaving(false);
    fetchReferrals();
  };

  if (loading) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center min-h-[400px]">
          <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <ClipboardList size={24} className="text-primary" />
            متابعة الإجراءات النظامية
          </h1>
          <p className="text-muted-foreground mt-1 text-sm">
            لوحة شاملة لمتابعة حالات التحويل من المعلمين ونسب الإنجاز
          </p>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
          <Card>
            <CardContent className="p-4 text-center">
              <BarChart3 size={20} className="mx-auto text-primary mb-1" />
              <p className="text-xs text-muted-foreground">إجمالي التحويلات</p>
              <p className="text-2xl font-bold text-foreground">{stats.total}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 text-center">
              <AlertTriangle size={20} className="mx-auto text-warning mb-1" />
              <p className="text-xs text-muted-foreground">بانتظار الإجراء</p>
              <p className="text-2xl font-bold text-warning">{stats.pending}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 text-center">
              <Clock size={20} className="mx-auto text-primary mb-1" />
              <p className="text-xs text-muted-foreground">قيد المتابعة</p>
              <p className="text-2xl font-bold text-primary">{stats.inProgress}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 text-center">
              <CheckCircle size={20} className="mx-auto text-success mb-1" />
              <p className="text-xs text-muted-foreground">تم الإجراء</p>
              <p className="text-2xl font-bold text-success">{stats.done}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 text-center">
              <UserCheck size={20} className="mx-auto text-primary mb-1" />
              <p className="text-xs text-muted-foreground">نسبة الإغلاق</p>
              <p className="text-2xl font-bold text-foreground">{stats.closureRate}%</p>
            </CardContent>
          </Card>
        </div>

        {viceStats.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">أداء الوكلاء / الإداريين</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {viceStats.map((v) => (
                  <div key={v.name} className="rounded-lg border border-border/50 p-3">
                    <p className="font-semibold text-sm text-foreground">{v.name}</p>
                    <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground">
                      <span>الإجمالي: {v.total}</span>
                      <span>مغلقة: {v.done}</span>
                      <span className="font-bold text-primary">
                        {v.total > 0 ? Math.round((v.done / v.total) * 100) : 0}%
                      </span>
                    </div>
                    <div className="w-full bg-muted rounded-full h-2 mt-2">
                      <div
                        className="bg-primary h-2 rounded-full transition-all"
                        style={{ width: `${v.total > 0 ? (v.done / v.total) * 100 : 0}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {isPrincipal && (
          <Card className="border-destructive/30">
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2 text-destructive">
                <Trash2 size={18} />
                إدارة التحويلات (صلاحية المدير)
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap items-center gap-3">
                <Input
                  type="date"
                  value={deleteDate}
                  onChange={(e) => setDeleteDate(e.target.value)}
                  className="w-[180px] h-9 text-xs"
                />
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button size="sm" variant="destructive" className="h-9 text-xs gap-1.5" disabled={deleting}>
                      <Trash2 size={14} /> حذف تحويلات اليوم المحدد
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>تأكيد حذف التحويلات</AlertDialogTitle>
                      <AlertDialogDescription>
                        سيتم حذف جميع التحويلات المسجلة في يوم {deleteDate}. هذا الإجراء لا يمكن التراجع عنه.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>إلغاء</AlertDialogCancel>
                      <AlertDialogAction onClick={handleDeleteByDate} className="bg-destructive hover:bg-destructive/90">
                        تأكيد الحذف
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <CardTitle className="text-base">جميع التحويلات</CardTitle>
              <Tabs value={statusFilter} onValueChange={setStatusFilter}>
                <TabsList className="h-8">
                  <TabsTrigger value="all" className="text-xs px-3 h-7">الكل</TabsTrigger>
                  <TabsTrigger value="transferred_after_third_note" className="text-xs px-3 h-7">معلّقة</TabsTrigger>
                  <TabsTrigger value="under_vice_followup" className="text-xs px-3 h-7">قيد المتابعة</TabsTrigger>
                  <TabsTrigger value="action_taken" className="text-xs px-3 h-7">مكتملة</TabsTrigger>
                </TabsList>
              </Tabs>
            </div>
          </CardHeader>
          <CardContent>
            {filtered.length === 0 ? (
              <div className="text-sm text-muted-foreground text-center py-8">لا توجد تحويلات</div>
            ) : (
              <div className="space-y-2 max-h-[500px] overflow-y-auto">
                {filtered.map((r) => (
                  <div key={r.id} className="rounded-lg border border-border/40 p-3 hover:bg-muted/20 transition-colors">
                    <div className="flex items-start justify-between gap-2 flex-wrap">
                      <div>
                        <p className="font-semibold text-sm text-foreground">
                          {r.payload?.studentName || r.student_name || "طالب"}
                        </p>
                        <div className="flex items-center gap-2 text-xs text-muted-foreground mt-1 flex-wrap">
                          <span>{r.payload?.grade || r.student_grade || ""}</span>
                          {r.payload?.period && <span>• الحصة {r.payload.period}</span>}
                          {r.payload?.subjectName && <span>• {r.payload.subjectName}</span>}
                          <span>• المعلم: {r.sender_name}</span>
                          <span>• {new Date(r.created_at).toLocaleDateString("ar-SA")}</span>
                        </div>
                        {r.reply_text && (
                          <p className="text-xs text-primary mt-1">الإجراء: {r.reply_text}</p>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        <span className={`text-[11px] px-2.5 py-1 rounded-full border font-bold ${REFERRAL_STATUS_CLASSES[r.status] || "bg-muted text-muted-foreground border-border"}`}>
                          {getReferralStatusLabel(r.status)}
                        </span>
                        {r.status !== "action_taken" && (profile?.is_principal || profile?.role_title?.includes("وكيل")) && (
                          <Button
                            variant="outline"
                            size="sm"
                            className="gap-1 h-7 text-xs"
                            onClick={() => {
                              setActionDialog(r);
                              setNewStatus(r.status === "transferred_after_third_note" ? "under_vice_followup" : "action_taken");
                              setActionText("");
                            }}
                          >
                            <Send size={12} /> تحديث
                          </Button>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Dialog open={!!actionDialog} onOpenChange={(open) => !open && setActionDialog(null)}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>تحديث حالة التحويل</DialogTitle>
            </DialogHeader>
            {actionDialog && (
              <div className="space-y-4 mt-2">
                <div className="bg-muted/30 rounded-lg p-3 text-sm space-y-1">
                  <p><strong>الطالب:</strong> {actionDialog.payload?.studentName || actionDialog.student_name}</p>
                  <p><strong>المعلم:</strong> {actionDialog.sender_name}</p>
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-bold">الحالة الجديدة</label>
                  <Select value={newStatus} onValueChange={setNewStatus}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="under_vice_followup">قيد المتابعة</SelectItem>
                      <SelectItem value="action_taken">تم اتخاذ الإجراء</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-bold">تفاصيل الإجراء</label>
                  <Textarea
                    placeholder="اكتب تفاصيل الإجراء المتخذ..."
                    rows={3}
                    value={actionText}
                    onChange={(e) => setActionText(e.target.value)}
                  />
                </div>
                <Button onClick={handleAction} disabled={saving} className="w-full gap-2">
                  <CheckCircle size={16} />
                  {saving ? "جارٍ الحفظ..." : "تأكيد التحديث"}
                </Button>
              </div>
            )}
          </DialogContent>
        </Dialog>
      </div>
    </AppLayout>
  );
};

export default ReferralTrackingPage;
