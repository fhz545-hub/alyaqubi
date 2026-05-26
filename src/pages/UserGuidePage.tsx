import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import AppLayout from "@/components/AppLayout";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { hasPermission, PERMISSION_LABELS, PermissionType } from "@/store/permissionsStore";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import TeacherProfileDossier from "@/components/teachers/TeacherProfileDossier";
import LoadingScreen from "@/components/LoadingScreen";
import { toast } from "sonner";
import {
  BookOpen, ShieldCheck, Eye, Lightbulb, MessageSquare, Send, Crown,
  GraduationCap, Users, Calendar, IdCard, AlertTriangle, CheckCircle2, XCircle,
  Sparkles, ArrowRight,
} from "lucide-react";

const PRINCIPAL_NAME = "فهد حامد الزهراني";
const GUIDE_VISITED_KEY = "user_guide_session_visited_v1";

export default function UserGuidePage() {
  const navigate = useNavigate();
  const { profile } = useAuth();
  const initialTab = (() => {
    try {
      const t = new URLSearchParams(window.location.search).get("tab");
      return t === "contact" || t === "permissions" || t === "rules" || t === "tips" ? t : "profile";
    } catch { return "profile"; }
  })();
  const [contactMsg, setContactMsg] = useState("");
  const [contactType, setContactType] = useState<"need" | "note" | "support" | "question">("question");
  const [sending, setSending] = useState(false);
  const [principal, setPrincipal] = useState<{ user_id: string; full_name: string } | null>(null);

  // ===== ملفي الوظيفي (مدمج) =====
  const [profileLoading, setProfileLoading] = useState(true);
  const [teacherName, setTeacherName] = useState("");
  const [civilId, setCivilId] = useState("");
  const [currentJob, setCurrentJob] = useState("");
  const [profileMissing, setProfileMissing] = useState(false);

  const isPrincipal = profile?.is_principal === true;
  const isTeacher = Boolean(!isPrincipal && profile?.role_title?.includes("معلم"));
  const userId = profile?.user_id || "";

  // mark visited so first-time redirect won't loop
  useEffect(() => {
    sessionStorage.setItem(GUIDE_VISITED_KEY, "1");
  }, []);

  useEffect(() => {
    if (isPrincipal) return;
    supabase
      .from("profiles")
      .select("user_id, full_name")
      .eq("is_principal", true)
      .limit(1)
      .maybeSingle()
      .then(({ data }) => { if (data) setPrincipal(data as any); });
  }, [isPrincipal]);

  useEffect(() => {
    const load = async () => {
      try {
        const myId = (profile?.national_id || "").replace(/\D/g, "");
        if (!myId && !profile?.full_name) { setProfileMissing(true); return; }
        let row: any = null;
        if (myId) {
          const r = await supabase.from("teachers")
            .select("full_name, civil_id, current_job")
            .eq("civil_id", myId).eq("active", true).maybeSingle();
          row = r.data;
        }
        if (!row && profile?.full_name) {
          const r2 = await supabase.from("teachers")
            .select("full_name, civil_id, current_job")
            .eq("full_name", profile.full_name).eq("active", true).maybeSingle();
          row = r2.data;
        }
        if (row) {
          setCivilId(row.civil_id);
          setTeacherName(row.full_name);
          setCurrentJob(row.current_job || "");
        } else {
          setProfileMissing(true);
        }
      } finally {
        setProfileLoading(false);
      }
    };
    load();
  }, [profile?.national_id, profile?.full_name]);

  const handleSendToPrincipal = async () => {
    if (!profile) return;
    if (!contactMsg.trim()) { toast.error("الرجاء كتابة نص الرسالة"); return; }
    if (!principal) { toast.error("تعذّر الوصول لحساب مدير المدرسة"); return; }
    setSending(true);
    const typeLabel = contactType === "need" ? "احتياج إضافي" : contactType === "note" ? "ملاحظة" : contactType === "support" ? "طلب دعم" : "استفسار";
    const { error } = await supabase.from("messages").insert({
      sender_id: profile.user_id,
      sender_name: profile.full_name,
      sender_role: profile.role_title || "مستخدم",
      recipient_id: principal.user_id,
      recipient_name: principal.full_name,
      message_type: "guide_contact",
      message_text: `[${typeLabel}] ${contactMsg.trim()}`,
      status: "sent",
    });
    setSending(false);
    if (error) { toast.error("تعذّر إرسال الرسالة"); return; }
    // إشعار المدير يُنشأ تلقائياً عبر محفّز قاعدة البيانات (يتجاوز قيود RLS).
    toast.success("تم إرسال رسالتك إلى مدير المدرسة");
    setContactMsg("");
  };

  const teacherFeatures = [
    "عرض لوحة التحكم وجميع المؤشرات (الغياب، التأخر، المخالفات، الملاحظات الصفية، الاستئذان، السلوك الإيجابي)",
    "تسجيل الملاحظات الصفية وفق المراحل المعتمدة",
    "طباعة كشوف متابعة المواد",
    "متابعة حالة الإحالات المحوّلة من قِبَله",
    "الاطلاع على ملفه الوظيفي الكامل (للقراءة)",
  ];
  const teacherRestrictions = [
    "لا يمكن الدخول إلى ملف الطالب الفردي",
    "لا يمكن الإضافة أو التعديل أو الحذف أو اعتماد الإجراءات",
    "لا يجوز مراسلة ولي الأمر مباشرة بشأن الملاحظات الصفية",
  ];
  const principalFeatures = [
    "صلاحيات كاملة على جميع الصفحات والإجراءات",
    "نظام صلاحيات دقيق متعدد المستويات",
    "إدارة المستخدمين والاعتمادات",
    "الاطلاع على سجل المراجعة (Audit Log)",
  ];

  const isNonTeaching = useMemo(() => {
    const j = (currentJob || "").trim();
    if (!j) return false;
    return ["مدير", "وكيل", "موجه", "محضر", "إداري", "اداري", "سكرتير"].some((n) => j.includes(n));
  }, [currentJob]);

  return (
    <AppLayout>
      <div className="space-y-4" dir="rtl">
        {/* Hero */}
        <Card className="overflow-hidden border-2 border-primary/20">
          <div className="relative bg-gradient-to-bl from-primary via-primary/95 to-primary/80 text-primary-foreground p-5">
            <div className="absolute -top-10 -right-10 w-40 h-40 rounded-full bg-white/10 blur-2xl pointer-events-none" />
            <div className="absolute -bottom-10 left-8 w-32 h-32 rounded-full bg-white/5 blur-3xl pointer-events-none" />
            <div className="relative flex items-center gap-3">
              <div className="w-12 h-12 rounded-2xl bg-white/15 backdrop-blur-md flex items-center justify-center shadow-lg ring-2 ring-white/20">
                <BookOpen size={22} />
              </div>
              <div className="flex-1 min-w-0">
                <h1 className="text-lg sm:text-xl font-extrabold leading-tight">دليل استخدام النظام</h1>
                <p className="text-[12px] sm:text-sm opacity-90 mt-0.5">مدرسة اليعقوبي الثانوية — صفحة شاملة لكل ما يهمك</p>
              </div>
              <Button size="sm" variant="secondary" onClick={() => navigate("/")} className="gap-1.5 shrink-0">
                <ArrowRight size={14} /> لوحة التحكم
              </Button>
            </div>
            {profile && (
              <div className="relative mt-4 flex items-center gap-2 bg-white/15 backdrop-blur-md rounded-xl p-2.5 border border-white/20">
                <div className="w-9 h-9 rounded-full bg-white/20 flex items-center justify-center shrink-0">
                  {isPrincipal ? <Crown size={15} /> : isTeacher ? <GraduationCap size={15} /> : <Users size={15} />}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-extrabold truncate">{profile.full_name}</p>
                  <p className="text-[11px] opacity-80 truncate">{profile.role_title}{isPrincipal && " • صلاحيات كاملة"}</p>
                </div>
              </div>
            )}
          </div>
        </Card>

        <Tabs defaultValue={initialTab} className="w-full">
          <div className="-mx-2 sm:mx-0 overflow-x-auto sidebar-scroll">
            <TabsList className="inline-flex sm:grid sm:grid-cols-5 w-max sm:w-full h-auto gap-1 px-2 sm:px-0">
              <TabsTrigger value="profile" className="text-[12px] sm:text-xs gap-1 py-2 px-3 whitespace-nowrap"><IdCard size={13} /> ملفي</TabsTrigger>
              <TabsTrigger value="permissions" className="text-[12px] sm:text-xs gap-1 py-2 px-3 whitespace-nowrap"><ShieldCheck size={13} /> صلاحياتي</TabsTrigger>
              <TabsTrigger value="rules" className="text-[12px] sm:text-xs gap-1 py-2 px-3 whitespace-nowrap"><Eye size={13} /> القواعد</TabsTrigger>
              <TabsTrigger value="tips" className="text-[12px] sm:text-xs gap-1 py-2 px-3 whitespace-nowrap"><Lightbulb size={13} /> نصائح</TabsTrigger>
              <TabsTrigger value="contact" className="text-[12px] sm:text-xs gap-1 py-2 px-3 whitespace-nowrap"><MessageSquare size={13} /> تواصل</TabsTrigger>
            </TabsList>
          </div>

          {/* ===== ملفي الوظيفي ===== */}
          <TabsContent value="profile" className="mt-4">
            <Card className="overflow-hidden">
              <div className="p-4 border-b bg-muted/30">
                <h2 className="text-base font-extrabold flex items-center gap-2">
                  <IdCard className="text-primary" size={18} /> ملفي الوظيفي
                </h2>
                <p className="text-xs text-muted-foreground mt-1">عرض كامل لبياناتك ومتابعتك (الحضور، الغياب، التأخر، الاستئذان، المخالفات والإجراءات) — للقراءة فقط</p>
              </div>
              {profileLoading ? (
                <LoadingScreen message="جارٍ تحميل ملفك" hint="نقرأ بياناتك ومؤشراتك من قاعدة البيانات" />
              ) : profileMissing ? (
                <div className="p-8 text-center">
                  <AlertTriangle className="mx-auto text-warning mb-3" size={36} />
                  <p className="font-bold mb-1">لم يتم العثور على ملف معلم مرتبط بحسابك</p>
                  <p className="text-sm text-muted-foreground">تأكد من إدخال رقم الهوية الوطنية في حسابك، أو راجع المدير لربطك بسجل المعلم.</p>
                  {profile?.national_id && (
                    <p className="text-xs text-muted-foreground mt-2">رقم هويتك المسجل: <span className="font-mono">{profile.national_id}</span></p>
                  )}
                </div>
              ) : (
                <TeacherProfileDossier
                  open={true}
                  onOpenChange={() => { /* مدمج */ }}
                  teacherName={teacherName}
                  teacherCivilId={civilId}
                  embedded
                  hideTeachingSections={isNonTeaching}
                />
              )}
            </Card>
          </TabsContent>

          {/* ===== الصلاحيات ===== */}
          <TabsContent value="permissions" className="mt-4 space-y-3">
            {isPrincipal ? (
              <Card className="p-4 bg-success/5 border-success/20">
                <h3 className="text-sm font-bold mb-2 flex items-center gap-2 text-success"><Crown size={16} /> مدير المدرسة — صلاحيات كاملة</h3>
                <ul className="space-y-1.5">
                  {principalFeatures.map((f, i) => (
                    <li key={i} className="flex items-start gap-2 text-xs"><span className="mt-1 w-1.5 h-1.5 rounded-full bg-success shrink-0" /><span>{f}</span></li>
                  ))}
                </ul>
              </Card>
            ) : isTeacher ? (
              <>
                <Card className="p-4 bg-success/5 border-success/20">
                  <h3 className="text-sm font-bold mb-2 flex items-center gap-2 text-success"><CheckCircle2 size={16} /> ما يمكن للمعلم القيام به</h3>
                  <ul className="space-y-1.5">
                    {teacherFeatures.map((f, i) => (<li key={i} className="flex items-start gap-2 text-xs"><span className="mt-1 w-1.5 h-1.5 rounded-full bg-success shrink-0" /><span>{f}</span></li>))}
                  </ul>
                </Card>
                <Card className="p-4 bg-destructive/5 border-destructive/20">
                  <h3 className="text-sm font-bold mb-2 flex items-center gap-2 text-destructive"><XCircle size={16} /> ما لا يُسمح به</h3>
                  <ul className="space-y-1.5">
                    {teacherRestrictions.map((f, i) => (<li key={i} className="flex items-start gap-2 text-xs"><span className="mt-1 w-1.5 h-1.5 rounded-full bg-destructive shrink-0" /><span>{f}</span></li>))}
                  </ul>
                </Card>
              </>
            ) : (
              <Card className="p-4">
                <h3 className="text-sm font-bold mb-3 flex items-center gap-2"><ShieldCheck size={15} className="text-primary" /> صلاحياتك المعتمدة</h3>
                <div className="grid sm:grid-cols-2 gap-1.5">
                  {(Object.keys(PERMISSION_LABELS) as PermissionType[]).map((p) => {
                    const has = hasPermission(userId, false, p);
                    return (
                      <div key={p} className={`flex items-center gap-2 text-xs rounded-md px-2 py-1.5 border ${has ? "bg-success/5 border-success/20" : "bg-muted/30 border-border/40 text-muted-foreground/70"}`}>
                        {has ? <CheckCircle2 size={13} className="text-success shrink-0" /> : <XCircle size={13} className="text-muted-foreground/50 shrink-0" />}
                        <span>{PERMISSION_LABELS[p]}</span>
                      </div>
                    );
                  })}
                </div>
                <p className="text-[11px] text-muted-foreground mt-3">تُمنح هذه الصلاحيات من قِبَل مدير المدرسة وفق المهام الموكلة إليك.</p>
              </Card>
            )}
          </TabsContent>

          {/* ===== القواعد ===== */}
          <TabsContent value="rules" className="mt-4 space-y-3">
            {[
              { t: "هيكلة النظام", b: "ثلاثة أقسام: لوحة التحكم، شؤون الطلاب، شؤون المعلمين. تظهر جميع الأقسام في القائمة الجانبية، ويتم تمييز ما تملك صلاحيته فقط." },
              { t: "شؤون الطلاب", b: "كشوف الطلاب، المواظبة، السلوك، الملاحظات الصفية، الإحالات، الإذونات والطباعة." },
              { t: "شؤون المعلمين", b: "كشف حضوري الشهري، استيراد ملفات حضوري، الأرشيف، والشؤون الإدارية." },
              { t: "الإجراءات التنفيذية", b: "التعديل والحذف والإرسال والاعتماد والطباعة الرسمية محصورة بمدير المدرسة والمصرّح لهم." },
              { t: "التواصل مع ولي الأمر", b: "لا يجوز للمعلم مراسلة ولي الأمر بخصوص الملاحظات الصفية؛ التواصل من قِبَل الإدارة فقط." },
            ].map((r, i) => (
              <Card key={i} className="p-3.5">
                <p className="text-sm font-bold mb-1">{r.t}</p>
                <p className="text-xs text-muted-foreground leading-relaxed">{r.b}</p>
              </Card>
            ))}
          </TabsContent>

          {/* ===== نصائح ===== */}
          <TabsContent value="tips" className="mt-4 space-y-2">
            {[
              "استخدم البحث السريع (Ctrl+K) للوصول لأي طالب فوراً.",
              "يمكنك مسح الباركود بكاميرا الجوال لتسجيل الحضور والتأخر بسرعة.",
              "جميع الإجراءات تُحفظ تلقائياً وتُزامَن لحظياً مع قاعدة البيانات.",
              "عند فقدان الاتصال، يعمل النظام في وضع عدم الاتصال وتُزامَن البيانات لاحقاً.",
              "ستظهر جميع الأقسام في القائمة الجانبية، والأقسام المقيّدة عليها قفل — اضغطها لمعرفة وصفها.",
            ].map((t, i) => (
              <div key={i} className="flex items-start gap-2 text-xs bg-muted/30 border border-border/40 rounded-lg px-3 py-2">
                <Sparkles size={13} className="text-primary mt-0.5 shrink-0" />
                <span className="text-foreground/90 leading-relaxed">{t}</span>
              </div>
            ))}
          </TabsContent>

          {/* ===== تواصل ===== */}
          <TabsContent value="contact" className="mt-4">
            {isPrincipal ? (
              <Card className="p-5 text-center bg-gradient-to-bl from-primary/10 to-transparent">
                <Crown size={22} className="mx-auto text-primary mb-2" />
                <p className="text-sm font-bold">أنت مدير المدرسة</p>
                <p className="text-xs text-muted-foreground mt-1">تصلك رسائل المعلمين والمستخدمين عبر جرس الإشعارات.</p>
              </Card>
            ) : (
              <Card className="p-4">
                <h3 className="text-sm font-bold mb-1 flex items-center gap-2"><Send size={14} className="text-primary" /> مراسلة مدير المدرسة</h3>
                <p className="text-[11px] text-muted-foreground mb-3">أرسل ملاحظتك مباشرة إلى <span className="font-semibold text-foreground">{principal?.full_name || PRINCIPAL_NAME}</span>.</p>
                <div className="grid grid-cols-4 gap-1.5 mb-2">
                  {([{ key: "question", label: "استفسار" }, { key: "need", label: "احتياج" }, { key: "note", label: "ملاحظة" }, { key: "support", label: "دعم" }] as const).map((opt) => (
                    <button key={opt.key} onClick={() => setContactType(opt.key)} className={`text-[11px] py-1.5 rounded-md border transition-colors ${contactType === opt.key ? "bg-primary text-primary-foreground border-primary" : "bg-background text-foreground border-border hover:bg-muted"}`}>
                      {opt.label}
                    </button>
                  ))}
                </div>
                <Textarea value={contactMsg} onChange={(e) => setContactMsg(e.target.value)} placeholder="اكتب رسالتك بأسلوب تربوي ومهني..." className="min-h-[100px] text-sm resize-none" maxLength={500} />
                <div className="flex items-center justify-between mt-2">
                  <span className="text-[10px] text-muted-foreground">{contactMsg.length}/500</span>
                  <Button size="sm" onClick={handleSendToPrincipal} disabled={sending || !contactMsg.trim() || !principal} className="gap-1.5">
                    <Send size={13} /> {sending ? "جاري الإرسال..." : "إرسال للمدير"}
                  </Button>
                </div>
              </Card>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </AppLayout>
  );
}
