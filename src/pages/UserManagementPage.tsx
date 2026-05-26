import { useState, useEffect, useMemo } from "react";
import AppLayout from "@/components/AppLayout";
import { supabase } from "@/integrations/supabase/client";
import { useAuth, UserProfile } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { CheckCircle, XCircle, Shield, Users, Settings2, Trash2, Bell, KeyRound, Mail, Eye, EyeOff, Copy } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { getActions, loadActions } from "@/store/actionsStore";
import { ACTION_LABELS } from "@/types/school";
import {
  loadPermissions, getUserPermissions, setUserPermissions,
  ALL_PERMISSIONS, PERMISSION_LABELS, PermissionType, PERMISSION_GROUPS,
} from "@/store/permissionsStore";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

const UserManagementPage = () => {
  const { profile, user } = useAuth();
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionsLoaded, setActionsLoaded] = useState(false);
  const [permissionsLoaded, setPermissionsLoaded] = useState(false);
  const [permDialogUser, setPermDialogUser] = useState<UserProfile | null>(null);
  const [selectedPerms, setSelectedPerms] = useState<PermissionType[]>([]);
  const [savingPerms, setSavingPerms] = useState(false);
  const [rejectConfirm, setRejectConfirm] = useState<UserProfile | null>(null);
  const [userEmails, setUserEmails] = useState<Record<string, string>>({});
  const [deletingAccount, setDeletingAccount] = useState(false);
  
  // Password reset state
  const [resetDialogUser, setResetDialogUser] = useState<UserProfile | null>(null);
  const [newPassword, setNewPassword] = useState("");
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [resettingPassword, setResettingPassword] = useState(false);

  const fetchUsers = async () => {
    const { data } = await supabase.from("profiles").select("*").order("created_at", { ascending: false });
    if (data) setUsers(data as unknown as UserProfile[]);
    setLoading(false);
  };

  // Fetch user emails for principal
  const fetchUserEmails = async (userIds: string[]) => {
    if (!profile?.is_principal || userIds.length === 0) return;
    try {
      const { data, error } = await supabase.functions.invoke("get-user-emails", {
        body: { user_ids: userIds },
      });
      if (!error && data?.emails) {
        setUserEmails(data.emails);
      }
    } catch (err) {
      console.warn("Failed to fetch emails:", err);
    }
  };

  useEffect(() => {
    fetchUsers();
    loadActions().then(() => setActionsLoaded(true));
    loadPermissions().then(() => setPermissionsLoaded(true));
  }, []);

  useEffect(() => {
    if (profile?.is_principal && users.length > 0) {
      const ids = users.filter(u => !u.is_principal).map(u => u.user_id);
      fetchUserEmails(ids);
    }
  }, [users, profile?.is_principal]);

  const pendingUsers = useMemo(() => users.filter(u => !u.approved && !u.is_principal), [users]);
  const approvedUsers = useMemo(() => users.filter(u => u.approved || u.is_principal), [users]);

  const userActionStats = useMemo(() => {
    if (!actionsLoaded) return {};
    const actions = getActions();
    const stats: Record<string, { late: number; absent: number; violation: number; permission: number; total: number }> = {};
    actions.forEach((a) => {
      const name = a.performedByName || "";
      if (!name) return;
      if (!stats[name]) stats[name] = { late: 0, absent: 0, violation: 0, permission: 0, total: 0 };
      if (a.type === "late") stats[name].late++;
      else if (a.type === "absent") stats[name].absent++;
      else if (a.type === "violation") stats[name].violation++;
      else if (a.type === "permission") stats[name].permission++;
      stats[name].total++;
    });
    return stats;
  }, [actionsLoaded]);

  const toggleApproval = async (targetUser: UserProfile) => {
    if (!profile?.is_principal) {
      toast({ title: "غير مصرح", description: "هذا الإجراء متاح لمدير المدرسة فقط", variant: "destructive" });
      return;
    }

    const nextApproved = !targetUser.approved;
    const { error } = await supabase
      .from("profiles")
      .update({ approved: nextApproved, approved_by: user?.id || profile?.user_id || null } as any)
      .eq("user_id", targetUser.user_id);

    if (error) {
      toast({ title: "خطأ", description: error.message, variant: "destructive" });
    } else {
      const principalId = user?.id || profile.user_id;

      if (!targetUser.is_principal) {
        if (nextApproved && targetUser.role_title.includes("معلم")) {
          await setUserPermissions(targetUser.user_id, ["print_subject_sheets", "record_class_notes"], principalId);
        }

        if (!nextApproved) {
          await setUserPermissions(targetUser.user_id, [], principalId);
        }

        await loadPermissions();
        setPermissionsLoaded(true);
      }

      toast({ title: targetUser.approved ? "تم إلغاء الاعتماد" : "تم اعتماد المستخدم ✅" });
      fetchUsers();
    }
  };

  const handleReject = async () => {
    if (!rejectConfirm || !profile?.is_principal || deletingAccount) return;
    setDeletingAccount(true);
    try {
      const { data, error } = await supabase.functions.invoke("delete-user-account", {
        body: { target_user_id: rejectConfirm.user_id },
      });

      if (error || data?.error) {
        toast({
          title: "فشل حذف الحساب",
          description: data?.error || error?.message || "تعذر حذف الحساب حالياً",
          variant: "destructive",
        });
      } else {
        toast({ title: "تم حذف الحساب وجميع بياناته المرتبطة ✅" });
        await fetchUsers();
      }
    } finally {
      setDeletingAccount(false);
      setRejectConfirm(null);
    }
  };

  const openPermDialog = (u: UserProfile) => {
    const perms = getUserPermissions(u.user_id);
    setSelectedPerms([...perms]);
    setPermDialogUser(u);
  };

  const togglePerm = (perm: PermissionType) => {
    setSelectedPerms((prev) =>
      prev.includes(perm) ? prev.filter((p) => p !== perm) : [...prev, perm]
    );
  };

  const savePerms = async () => {
    if (!permDialogUser || !user) return;
    setSavingPerms(true);
    const ok = await setUserPermissions(permDialogUser.user_id, selectedPerms, user.id);
    setSavingPerms(false);
    if (ok) {
      toast({ title: "تم تحديث الصلاحيات ✅" });
      setPermDialogUser(null);
      await loadPermissions();
      setPermissionsLoaded(true);
    } else {
      toast({ title: "فشل تحديث الصلاحيات", variant: "destructive" });
    }
  };

  const handleResetPassword = async () => {
    if (!resetDialogUser || !newPassword || newPassword.length < 6) {
      toast({ title: "كلمة المرور يجب أن تكون 6 أحرف على الأقل", variant: "destructive" });
      return;
    }
    setResettingPassword(true);
    try {
      const { data, error } = await supabase.functions.invoke("admin-reset-password", {
        body: { target_user_id: resetDialogUser.user_id, new_password: newPassword },
      });
      if (error || data?.error) {
        toast({ title: "فشل إعادة تعيين كلمة المرور", description: data?.error || error?.message, variant: "destructive" });
      } else {
        toast({ title: "تم إعادة تعيين كلمة المرور بنجاح ✅" });
        setResetDialogUser(null);
        setNewPassword("");
      }
    } catch (err) {
      toast({ title: "خطأ غير متوقع", variant: "destructive" });
    }
    setResettingPassword(false);
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast({ title: "تم النسخ ✅" });
  };

  const UserCard = ({ u }: { u: UserProfile }) => {
    const stats = userActionStats[u.full_name];
    const perms = permissionsLoaded ? getUserPermissions(u.user_id) : [];
    const email = userEmails[u.user_id];
    
    return (
      <div className="px-5 py-4 hover:bg-muted/20 transition-colors">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-primary/10 text-primary flex items-center justify-center text-sm font-bold">
              {u.full_name.charAt(0)}
            </div>
            <div>
              <p className="font-semibold text-foreground">{u.full_name}</p>
              <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                <span className="text-xs px-2 py-0.5 rounded-full bg-primary/10 text-primary font-semibold">{u.role_title}</span>
                <span className="text-xs text-muted-foreground font-mono">{u.phone}</span>
                <span className="text-xs text-muted-foreground">هوية: {u.national_id}</span>
              </div>
              {/* Show email for principal */}
              {profile?.is_principal && email && (
                <div className="flex items-center gap-1 mt-1">
                  <Mail size={11} className="text-muted-foreground" />
                  <span className="text-[11px] text-muted-foreground font-mono">{email}</span>
                  <button onClick={() => copyToClipboard(email)} className="text-muted-foreground hover:text-primary">
                    <Copy size={10} />
                  </button>
                </div>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`text-xs px-2 py-1 rounded-full font-semibold ${u.approved ? "bg-success/10 text-success" : "bg-warning/10 text-warning"}`}>
              {u.is_principal ? "مدير" : u.approved ? "معتمد" : "بانتظار الاعتماد"}
            </span>
            {profile?.is_principal && !u.is_principal && (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  className={`gap-1 text-xs ${u.approved ? "text-destructive" : "text-success"}`}
                  onClick={() => toggleApproval(u)}
                >
                  {u.approved ? <XCircle size={14} /> : <CheckCircle size={14} />}
                  {u.approved ? "إلغاء" : "اعتماد"}
                </Button>
                {!u.approved && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-1 text-xs text-destructive"
                    onClick={() => setRejectConfirm(u)}
                  >
                    <Trash2 size={14} />
                    رفض
                  </Button>
                )}
                {u.approved && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-1 text-xs text-destructive"
                    onClick={() => setRejectConfirm(u)}
                  >
                    <Trash2 size={14} />
                    حذف الحساب
                  </Button>
                )}
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1 text-xs text-primary"
                  onClick={() => openPermDialog(u)}
                >
                  <Settings2 size={14} />
                  الصلاحيات
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1 text-xs text-warning"
                  onClick={() => { setResetDialogUser(u); setNewPassword(""); setShowNewPassword(false); }}
                >
                  <KeyRound size={14} />
                  كلمة المرور
                </Button>
              </>
            )}
          </div>
        </div>

        {perms.length > 0 && !u.is_principal && (
          <div className="flex items-center gap-2 mt-2 flex-wrap">
            <span className="text-xs text-muted-foreground">الصلاحيات:</span>
            {perms.map((p) => (
              <span key={p} className="text-xs px-2 py-0.5 rounded-full bg-accent/10 text-accent-foreground font-medium">
                {PERMISSION_LABELS[p]}
              </span>
            ))}
          </div>
        )}

        {stats && (
          <div className="flex items-center gap-3 mt-2 flex-wrap">
            <span className="text-xs text-muted-foreground">الإجراءات:</span>
            {stats.absent > 0 && <span className="text-xs px-2 py-0.5 rounded-full bg-destructive/10 text-destructive">غياب: {stats.absent}</span>}
            {stats.late > 0 && <span className="text-xs px-2 py-0.5 rounded-full bg-warning/10 text-warning">تأخر: {stats.late}</span>}
            {stats.violation > 0 && <span className="text-xs px-2 py-0.5 rounded-full bg-destructive/10 text-destructive">مخالفات: {stats.violation}</span>}
            {stats.permission > 0 && <span className="text-xs px-2 py-0.5 rounded-full bg-accent/10 text-accent-foreground">استئذان: {stats.permission}</span>}
            <span className="text-xs font-bold text-foreground">الإجمالي: {stats.total}</span>
          </div>
        )}
      </div>
    );
  };

  return (
    <AppLayout>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
          <Users size={24} /> المستخدمين والصلاحيات
        </h1>
        <p className="text-muted-foreground mt-1">عرض المستخدمين وإدارة الصلاحيات ومتابعة الإجراءات</p>
        {profile && (
          <p className="text-xs text-muted-foreground mt-0.5">المستخدم: {profile.role_title} {profile.full_name}</p>
        )}
      </div>

      {/* Pending Registrations */}
      {pendingUsers.length > 0 && (
        <div className="bg-warning/5 rounded-xl border border-warning/30 overflow-hidden mb-6">
          <div className="px-5 py-3 bg-warning/10 border-b border-warning/30 flex items-center gap-2">
            <Bell size={16} className="text-warning animate-pulse" />
            <h2 className="font-semibold text-warning text-sm">طلبات تسجيل جديدة ({pendingUsers.length})</h2>
          </div>
          <div className="divide-y divide-warning/20">
            {pendingUsers.map(u => <UserCard key={u.id} u={u} />)}
          </div>
        </div>
      )}

      {/* Approved Users */}
      <div className="bg-card rounded-xl border border-border/50 overflow-hidden mb-6">
        <div className="px-5 py-3 bg-muted/50 border-b border-border/50 flex items-center justify-between">
          <h2 className="font-semibold text-foreground text-sm">المستخدمون المعتمدون ({approvedUsers.length})</h2>
          {profile?.is_principal && (
            <span className="text-xs px-2 py-1 rounded-full bg-primary/10 text-primary font-semibold flex items-center gap-1">
              <Shield size={12} /> صلاحيات المدير
            </span>
          )}
        </div>

        {loading ? (
          <div className="p-8 text-center text-muted-foreground">جارٍ التحميل...</div>
        ) : approvedUsers.length === 0 ? (
          <div className="p-8 text-center text-muted-foreground">لا يوجد مستخدمون معتمدون</div>
        ) : (
          <div className="divide-y divide-border/20">
            {approvedUsers.map(u => <UserCard key={u.id} u={u} />)}
          </div>
        )}
      </div>

      {/* Permissions Dialog */}
      <Dialog open={!!permDialogUser} onOpenChange={(open) => !open && setPermDialogUser(null)}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle className="flex items-center justify-between gap-2">
              <span className="flex items-center gap-2">
                <Settings2 size={18} className="text-primary" />
                صلاحيات {permDialogUser?.full_name}
              </span>
              <span className="text-xs px-2 py-0.5 rounded-full bg-primary/10 text-primary font-semibold">
                {selectedPerms.length} / {ALL_PERMISSIONS.length}
              </span>
            </DialogTitle>
          </DialogHeader>

          {/* Quick toolbar */}
          <div className="flex items-center justify-between flex-wrap gap-2 mt-2 p-3 rounded-lg bg-muted/30 border border-border/50">
            <div className="flex items-center gap-2">
              <Button size="sm" variant="outline" className="text-xs h-7" onClick={() => setSelectedPerms([...ALL_PERMISSIONS])}>
                تحديد الكل
              </Button>
              <Button size="sm" variant="outline" className="text-xs h-7" onClick={() => setSelectedPerms([])}>
                إلغاء الكل
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="text-xs h-7"
                onClick={() =>
                  setSelectedPerms([
                    "print_subject_sheets",
                    "record_class_notes",
                  ])
                }
              >
                صلاحيات معلم افتراضية
              </Button>
            </div>
            <p className="text-[11px] text-muted-foreground">انقر على رأس المجموعة لتفعيل/إلغاء كل صلاحياتها</p>
          </div>

          <div className="space-y-4 mt-3 max-h-[60vh] overflow-y-auto pr-1">
            {PERMISSION_GROUPS.map((group) => {
              const groupPerms = group.permissions;
              const allSelected = groupPerms.every((p) => selectedPerms.includes(p));
              const someSelected = groupPerms.some((p) => selectedPerms.includes(p));
              const toggleGroup = () => {
                if (allSelected) {
                  setSelectedPerms((prev) => prev.filter((p) => !groupPerms.includes(p)));
                } else {
                  setSelectedPerms((prev) => [...new Set([...prev, ...groupPerms])]);
                }
              };
              return (
                <div key={group.key} className="rounded-xl border border-border/60 overflow-hidden bg-card">
                  <button
                    type="button"
                    onClick={toggleGroup}
                    className={`w-full flex items-center justify-between gap-2 px-4 py-2.5 transition-colors ${
                      allSelected
                        ? "bg-primary/10 hover:bg-primary/15"
                        : someSelected
                        ? "bg-warning/10 hover:bg-warning/15"
                        : "bg-muted/40 hover:bg-muted/60"
                    }`}
                  >
                    <span className="flex items-center gap-2 font-semibold text-sm text-foreground">
                      <span className="text-base">{group.icon}</span>
                      {group.label}
                    </span>
                    <span className="text-[11px] px-2 py-0.5 rounded-full bg-background/80 text-muted-foreground font-mono">
                      {groupPerms.filter((p) => selectedPerms.includes(p)).length} / {groupPerms.length}
                    </span>
                  </button>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 p-2 bg-background/50">
                    {groupPerms.map((perm) => (
                      <label
                        key={perm}
                        className={`flex items-center gap-2.5 px-3 py-2 rounded-lg border transition-all cursor-pointer text-sm ${
                          selectedPerms.includes(perm)
                            ? "bg-primary/5 border-primary/40 text-foreground"
                            : "bg-card border-border/40 text-muted-foreground hover:bg-muted/30"
                        }`}
                      >
                        <Checkbox
                          checked={selectedPerms.includes(perm)}
                          onCheckedChange={() => togglePerm(perm)}
                        />
                        <span className="font-medium">{PERMISSION_LABELS[perm]}</span>
                      </label>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>

          <div className="flex items-center gap-2 mt-4 pt-3 border-t border-border/50">
            <Button onClick={savePerms} disabled={savingPerms} className="flex-1 gap-2">
              <CheckCircle size={16} />
              {savingPerms ? "جارٍ الحفظ..." : `حفظ ${selectedPerms.length} صلاحية`}
            </Button>
            <Button variant="outline" onClick={() => setPermDialogUser(null)} disabled={savingPerms}>
              إلغاء
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Password Reset Dialog */}
      <Dialog open={!!resetDialogUser} onOpenChange={(open) => !open && setResetDialogUser(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <KeyRound size={18} className="text-warning" />
              إعادة تعيين كلمة المرور
            </DialogTitle>
          </DialogHeader>
          {resetDialogUser && (
            <div className="space-y-4 mt-2">
              <div className="bg-muted/30 rounded-lg p-3 space-y-1">
                <p className="text-sm font-semibold text-foreground">{resetDialogUser.full_name}</p>
                <p className="text-xs text-muted-foreground">{resetDialogUser.role_title}</p>
                {userEmails[resetDialogUser.user_id] && (
                  <p className="text-xs text-muted-foreground font-mono">{userEmails[resetDialogUser.user_id]}</p>
                )}
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-foreground">كلمة المرور الجديدة</label>
                <div className="relative">
                  <Input
                    type={showNewPassword ? "text" : "password"}
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="6 أحرف على الأقل"
                    dir="ltr"
                    minLength={6}
                  />
                  <button
                    type="button"
                    onClick={() => setShowNewPassword(!showNewPassword)}
                    className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  >
                    {showNewPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>
              <Button onClick={handleResetPassword} disabled={resettingPassword || newPassword.length < 6} className="w-full gap-2">
                <KeyRound size={16} />
                {resettingPassword ? "جارٍ إعادة التعيين..." : "إعادة تعيين كلمة المرور"}
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Reject Confirm Dialog */}
      <Dialog open={!!rejectConfirm} onOpenChange={(open) => !open && setRejectConfirm(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-destructive flex items-center gap-2">
              <Trash2 size={18} />
              حذف حساب المستخدم
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            سيتم حذف حساب <strong className="text-foreground">{rejectConfirm?.full_name}</strong> نهائياً مع جميع بياناته المرتبطة وإنهاء جلساته.
          </p>
          <div className="flex gap-2 mt-3">
            <Button variant="outline" className="flex-1" onClick={() => setRejectConfirm(null)}>إلغاء</Button>
            <Button variant="destructive" className="flex-1" onClick={handleReject} disabled={deletingAccount}>
              {deletingAccount ? "جارٍ الحذف..." : "تأكيد الحذف"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
};

export default UserManagementPage;
