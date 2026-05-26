import { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import PrincipalContactInbox from "./PrincipalContactInbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogClose } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";
import { hasPermission, PERMISSION_LABELS, PermissionType } from "@/store/permissionsStore";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { getCurrentAcademicWeek, getAcademicDayName } from "@/utils/academicWeeks";
import { getHijriDate } from "@/utils/hijri";
import {
  HelpCircle,
  CheckCircle2,
  XCircle,
  ShieldCheck,
  Eye,
  BookOpen,
  Lightbulb,
  MessageSquare,
  Send,
  Code2,
  Sparkles,
  GraduationCap,
  Crown,
  Users,
  CalendarDays,
  Sun,
  Clock,
  Calendar,
  X,
  Hourglass,
  Flame,
  Palmtree,
} from "lucide-react";

// Session-scoped: shows once on initial entry per browser session, never on internal navigation
const GUIDE_SESSION_SHOWN_KEY = "user_guide_session_shown_v4";
const GUIDE_DISMISSED_KEY = "user_guide_dismissed_v3";
const PRINCIPAL_NAME = "فهد حامد الزهراني";
// Saudi MoE official Term 2 calendar — 1447/1448H
// Eid Al-Adha vacation begins after Thursday May 21, 2026 (end of week 15)
const EID_ADHA_VACATION_START = "2026-05-22";
const FINAL_EXAMS_START = "2026-06-21";
const SUMMER_VACATION_START = "2026-06-26";

interface ConversationItem {
  id: string;
  message_text: string;
  reply_text: string | null;
  created_at: string;
  replied_at: string | null;
  status: string;
}

// Helper Components
const Section = ({ icon, title, items, tone }: { icon: React.ReactNode; title: string; items: string[]; tone: "success" | "warn" }) => {
  const toneClasses = tone === "success" ? "bg-success/5 border-success/20" : "bg-destructive/5 border-destructive/20";
  const iconColor = tone === "success" ? "text-success" : "text-destructive";
  return (
    <div className={`rounded-xl border p-4 ${toneClasses}`}>
      <h3 className={`text-sm font-bold mb-2 flex items-center gap-2 ${iconColor}`}>{icon}{title}</h3>
      <ul className="space-y-1.5">
        {items.map((item, i) => (
          <li key={i} className="flex items-start gap-2 text-xs text-foreground/85 leading-relaxed">
            <span className={`mt-1 w-1.5 h-1.5 rounded-full shrink-0 ${tone === "success" ? "bg-success" : "bg-destructive"}`} />
            <span>{item}</span>
          </li>
        ))}
      </ul>
    </div>
  );
};

const RuleCard = ({ title, body, highlight }: { title: string; body: string; highlight?: boolean }) => (
  <div className={`rounded-xl border p-3.5 ${highlight ? "bg-primary/5 border-primary/30" : "bg-card border-border"}`}>
    <p className="text-sm font-bold text-foreground mb-1 flex items-center gap-1.5">
      {highlight && <Eye size={13} className="text-primary" />}
      {title}
    </p>
    <p className="text-xs text-muted-foreground leading-relaxed">{body}</p>
  </div>
);

const ConversationBubble = ({ item }: { item: ConversationItem }) => {
  const sentDate = new Date(item.created_at);
  const sentLabel = sentDate.toLocaleString("ar", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
  const repliedLabel = item.replied_at ? new Date(item.replied_at).toLocaleString("ar", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }) : null;
  const cleanText = item.message_text.replace(/^\[[^\]]+\]\s*/, "");
  const typeMatch = item.message_text.match(/^\[([^\]]+)\]/);
  const typeLabel = typeMatch ? typeMatch[1] : null;

  return (
    <div className="space-y-1.5">
      <div className="flex justify-end">
        <div className="max-w-[88%] rounded-2xl rounded-tr-sm bg-primary text-primary-foreground px-3 py-2 shadow-sm">
          {typeLabel && (<span className="inline-block text-[9px] font-bold bg-white/20 rounded-full px-2 py-0.5 mb-1">{typeLabel}</span>)}
          <p className="text-[12px] leading-relaxed whitespace-pre-wrap break-words">{cleanText}</p>
          <p className="text-[9px] opacity-80 mt-1 text-left">{sentLabel}</p>
        </div>
      </div>
      {item.reply_text ? (
        <div className="flex justify-start">
          <div className="max-w-[88%] rounded-2xl rounded-tl-sm bg-card border border-success/30 px-3 py-2 shadow-sm">
            <div className="flex items-center gap-1.5 mb-1">
              <span className="inline-block w-1.5 h-1.5 rounded-full bg-success" />
              <span className="text-[9px] font-bold text-success">رد مدير المدرسة</span>
            </div>
            <p className="text-[12px] leading-relaxed text-foreground whitespace-pre-wrap break-words">{item.reply_text}</p>
            {repliedLabel && (<p className="text-[9px] text-muted-foreground mt-1">{repliedLabel}</p>)}
          </div>
        </div>
      ) : (
        <div className="flex justify-start">
          <span className="text-[10px] text-muted-foreground bg-muted/40 rounded-full px-2 py-0.5 italic">بانتظار رد المدير...</span>
        </div>
      )}
    </div>
  );
};

// Academic Info Tab Component
const AcademicInfoTab = () => {
  const today = useMemo(() => new Date(), []);
  const academicWeek = getCurrentAcademicWeek(today);
  const dayName = getAcademicDayName(today);
  const hijri = getHijriDate(today);
  const gregorian = today.toLocaleDateString("ar", { year: "numeric", month: "long", day: "numeric" });

  const daysBetween = (from: Date, toIso: string): number => {
    const a = new Date(from.getFullYear(), from.getMonth(), from.getDate()).getTime();
    const b = new Date(toIso + "T00:00:00").getTime();
    return Math.max(0, Math.ceil((b - a) / (1000 * 60 * 60 * 24)));
  };

  const daysToExams = daysBetween(today, FINAL_EXAMS_START);
  const daysToSummer = daysBetween(today, SUMMER_VACATION_START);
  const daysToEidAdha = daysBetween(today, EID_ADHA_VACATION_START);

  return (
    <div className="space-y-3">
      <div className="rounded-xl bg-gradient-to-bl from-primary via-primary/90 to-primary/70 text-primary-foreground p-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-white/20 backdrop-blur-sm flex items-center justify-center shadow-lg">
            <Sun size={20} />
          </div>
          <div>
            <p className="text-sm font-bold">{dayName}</p>
            <p className="text-xs opacity-90">يومك الدراسي — لمحة سريعة</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2.5">
        <div className="rounded-xl border p-3 bg-primary/5 border-primary/20">
          <div className="flex items-center gap-1.5 text-[10px] font-semibold text-muted-foreground mb-1">
            <CalendarDays size={12} />
            <span>هجري</span>
          </div>
          <p className="text-[12px] font-bold text-foreground leading-snug">{hijri}</p>
        </div>
        <div className="rounded-xl border p-3 bg-muted/30 border-border/50">
          <div className="flex items-center gap-1.5 text-[10px] font-semibold text-muted-foreground mb-1">
            <CalendarDays size={12} />
            <span>ميلادي</span>
          </div>
          <p className="text-[12px] font-bold text-foreground leading-snug">{gregorian}</p>
        </div>
      </div>

      <div className="rounded-xl border border-primary/20 bg-gradient-to-l from-primary/8 to-transparent p-3.5">
        <div className="flex items-center gap-2 mb-1">
          <BookOpen size={14} className="text-primary" />
          <span className="text-[11px] font-semibold text-muted-foreground">الأسبوع الدراسي الحالي</span>
        </div>
        {academicWeek ? (
          <div className="flex items-baseline gap-2 flex-wrap">
            <span className="text-base font-bold text-foreground">{academicWeek.week}</span>
            <span className="text-[11px] text-muted-foreground">— {academicWeek.semester}</span>
          </div>
        ) : (
          <p className="text-sm font-bold text-muted-foreground">إجازة بين الفصول الدراسية</p>
        )}
      </div>

      {/* Countdown indicators — auto-calculated, fully responsive */}
      <div className="space-y-2">
        <div className="flex items-center gap-2 px-1">
          <div className="h-px flex-1 bg-gradient-to-l from-border to-transparent" />
          <span className="text-[10px] font-bold text-muted-foreground tracking-wide">المؤشرات الزمنية</span>
          <div className="h-px flex-1 bg-gradient-to-r from-border to-transparent" />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
          <CountdownTile
            icon={<Flame size={14} />}
            label="إجازة عيد الأضحى"
            days={daysToEidAdha}
            tone="info"
          />
          <CountdownTile
            icon={<Hourglass size={14} />}
            label="الاختبارات النهائية"
            days={daysToExams}
            tone="warn"
          />
          <CountdownTile
            icon={<Palmtree size={14} />}
            label="الإجازة الصيفية"
            days={daysToSummer}
            tone="success"
          />
        </div>
      </div>

      {/* Branded slogan footer */}
      <div className="relative mt-2 rounded-xl overflow-hidden border border-primary/20 bg-gradient-to-l from-primary/10 via-primary/5 to-transparent p-3.5">
        <div className="absolute inset-y-0 right-0 w-1 bg-gradient-to-b from-primary via-primary/60 to-primary/20" />
        <div className="flex items-start gap-2.5">
          <div className="w-7 h-7 rounded-lg bg-primary/15 flex items-center justify-center text-primary shrink-0">
            <Sparkles size={14} />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[12px] font-extrabold text-foreground leading-snug">
              نحو يوم دراسي مُلهم — منصة اليعقوبي ترافقك خطوة بخطوة
            </p>
            <p className="text-[10px] text-muted-foreground mt-0.5 leading-relaxed">
              معلومات محدثة لحظياً، ومؤشرات دقيقة تخدم رسالتك التربوية
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

// Countdown tile — creative, animated, themed via design tokens
const CountdownTile = ({
  icon,
  label,
  days,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  days: number;
  tone: "info" | "warn" | "success";
}) => {
  const palette =
    tone === "warn"
      ? {
          bg: "bg-warning/10",
          border: "border-warning/30",
          text: "text-warning",
          ring: "from-warning/30 via-warning/10 to-transparent",
          glow: "bg-warning/20",
        }
      : tone === "success"
      ? {
          bg: "bg-success/10",
          border: "border-success/30",
          text: "text-success",
          ring: "from-success/30 via-success/10 to-transparent",
          glow: "bg-success/20",
        }
      : {
          bg: "bg-primary/10",
          border: "border-primary/30",
          text: "text-primary",
          ring: "from-primary/30 via-primary/10 to-transparent",
          glow: "bg-primary/20",
        };

  // أبرز التنبيه عند اقتراب الموعد (≤ 7 أيام)
  const isImminent = days > 0 && days <= 7;
  const isReached = days === 0;

  return (
    <div
      className={`relative overflow-hidden rounded-2xl border p-3.5 ${palette.bg} ${palette.border} transition-all hover:-translate-y-0.5 hover:shadow-md group`}
    >
      {/* خلفية متدرجة دائرية */}
      <div className={`absolute -top-8 -left-8 w-24 h-24 rounded-full bg-gradient-radial ${palette.ring} opacity-60 blur-xl`} />
      {/* وميض خفيف عند الاقتراب */}
      {isImminent && (
        <div className={`absolute inset-0 ${palette.glow} animate-pulse pointer-events-none`} />
      )}

      <div className="relative flex items-center justify-between mb-2">
        <div className={`w-7 h-7 rounded-lg flex items-center justify-center ${palette.text} bg-background/70 backdrop-blur-sm shadow-sm`}>
          {icon}
        </div>
        {isImminent && (
          <span className={`text-[9px] font-extrabold ${palette.text} bg-background/80 rounded-full px-1.5 py-0.5 border ${palette.border}`}>
            اقترب!
          </span>
        )}
        {isReached && (
          <span className={`text-[9px] font-extrabold ${palette.text} bg-background/80 rounded-full px-1.5 py-0.5 border ${palette.border}`}>
            اليوم
          </span>
        )}
      </div>

      <p className="relative text-[10px] font-bold text-muted-foreground leading-tight mb-1.5 truncate">{label}</p>

      <div className="relative flex items-baseline gap-1">
        <span className={`text-3xl font-black ${palette.text} tabular-nums leading-none drop-shadow-sm`}>
          {days}
        </span>
        <span className="text-[10px] text-muted-foreground font-bold">
          {days === 1 ? "يوم" : days === 2 ? "يومان" : days <= 10 ? "أيام" : "يوم"}
        </span>
      </div>

      {/* شريط تقدم رمزي */}
      <div className="relative mt-2 h-1 rounded-full bg-background/50 overflow-hidden">
        <div
          className={`h-full rounded-full ${palette.text.replace("text-", "bg-")} transition-all`}
          style={{ width: `${Math.max(8, Math.min(100, 100 - days))}%` }}
        />
      </div>
    </div>
  );
};

// Main UserGuideDialog Component
const UserGuideDialog = () => {
  const navigate = useNavigate();
  const { profile } = useAuth();
  const [open, setOpen] = useState(false);
  const [inboxOpen, setInboxOpen] = useState(false);
  const [contactMsg, setContactMsg] = useState("");
  const [contactType, setContactType] = useState<"need" | "note" | "support" | "question">("question");
  const [sending, setSending] = useState(false);
  const [principal, setPrincipal] = useState<{ user_id: string; full_name: string } | null>(null);
  const [conversation, setConversation] = useState<ConversationItem[]>([]);

  const isPrincipal = profile?.is_principal === true;
  const isTeacher = Boolean(!isPrincipal && profile?.role_title?.includes("معلم"));
  const userId = profile?.user_id || "";

  useEffect(() => {
    if (!profile) return;
    // الدليل أصبح صفحة كاملة (/guide) — لم يعد يُفتح كنافذة منبثقة تلقائياً.
    return;
  }, [profile]);

  useEffect(() => {
    if (!open || isPrincipal) return;
    supabase
      .from("profiles")
      .select("user_id, full_name")
      .eq("is_principal", true)
      .limit(1)
      .maybeSingle()
      .then(({ data }) => {
        if (data) setPrincipal(data as any);
      });
  }, [open, isPrincipal]);

  const loadConversation = async () => {
    if (!profile || isPrincipal) return;
    const { data } = await supabase
      .from("messages")
      .select("id, message_text, reply_text, created_at, replied_at, status")
      .eq("sender_id", profile.user_id)
      .eq("message_type", "guide_contact")
      .order("created_at", { ascending: false })
      .limit(20);
    setConversation((data || []) as ConversationItem[]);
  };

  useEffect(() => {
    if (open && !isPrincipal) loadConversation();
  }, [open, isPrincipal, profile?.user_id]);

  useEffect(() => {
    if (!open || isPrincipal || !profile) return;
    const channel = supabase
      .channel(`guide-contact-${profile.user_id}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "messages", filter: `sender_id=eq.${profile.user_id}` },
        () => loadConversation()
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [open, isPrincipal, profile?.user_id]);

  const handleDismiss = () => {
    localStorage.setItem(GUIDE_DISMISSED_KEY, "true");
    setOpen(false);
  };

  const handleSendToPrincipal = async () => {
    if (!profile) return;
    if (!contactMsg.trim()) {
      toast.error("الرجاء كتابة نص الرسالة");
      return;
    }
    if (!principal) {
      toast.error("تعذّر الوصول لحساب مدير المدرسة");
      return;
    }
    setSending(true);
    const typeLabel =
      contactType === "need" ? "احتياج إضافي" : contactType === "note" ? "ملاحظة" : contactType === "support" ? "طلب دعم" : "استفسار";

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
    if (error) {
      console.error(error);
      toast.error("تعذّر إرسال الرسالة، حاول لاحقاً");
      return;
    }
    // إشعار المدير يُنشأ تلقائياً عبر محفّز قاعدة البيانات.
    toast.success("تم إرسال رسالتك إلى مدير المدرسة");
    setContactMsg("");
    loadConversation();
  };

  const teacherFeatures = [
    "عرض لوحة التحكم وجميع المؤشرات (الغياب، التأخر، المخالفات، الملاحظات الصفية، الاستئذان، السلوك الإيجابي)",
    "الاطلاع على الأسماء والأعداد ونوع المؤشر للأغراض التربوية",
    "تسجيل الملاحظات الصفية وفق المراحل المعتمدة",
    "طباعة كشوف متابعة المواد",
    "متابعة حالة الإحالات المحوّلة من قِبَله",
    "الاطلاع على الأسابيع الدراسية والإجازات الرسمية",
  ];

  const teacherRestrictions = [
    "لا يمكن الدخول إلى ملف الطالب الفردي",
    "لا تتوفر صلاحيات الإرسال أو الطباعة التنفيذية",
    "لا يمكن الإضافة أو التعديل أو الحذف أو اعتماد الإجراءات",
    "لا يجوز مراسلة ولي الأمر مباشرة بشأن الملاحظات الصفية",
  ];

  const principalFeatures = [
    "صلاحيات كاملة على جميع الصفحات والإجراءات",
    "قسم شؤون الطلاب الموحد: المواظبة، السلوك، الملاحظات الصفية، الإحالات، الإذونات، والطباعة في صفحة واحدة",
    "قسم شؤون المعلمين الموحد: كشف حضوري الشهري + الشؤون الإدارية + الأرشيف الموحد (الخطابات والإجراءات وسجل المعلمين)",
    "ربط رقم هوية المعلم تلقائياً عند استيراد ملفات حضوري وإنشاء سجل المعلم إن لم يكن موجوداً",
    "نظام صلاحيات دقيق متعدد المستويات: عرض/إضافة/تعديل/حذف/طباعة/إرسال — مجمّعة في 9 مجموعات وظيفية",
    "إدارة المستخدمين والاعتمادات وإعادة تعيين كلمات المرور وحذف الحسابات",
    "مؤشرات حية مأخوذة من قاعدة البيانات مباشرة في شؤون الطلاب وشؤون المعلمين",
    "إدارة السلوك الإيجابي ومسار التحسن السلوكي — حصراً للمدير ووكيل شؤون الطلاب",
    "الاطلاع على سجل المراجعة (Audit Log) وأرشفة مجلدات الأشهر السابقة دون حذفها",
  ];

  return (
    <>
      <button
        onClick={() => navigate("/guide")}
        className="fixed bottom-6 left-6 z-50 w-12 h-12 rounded-full bg-primary text-primary-foreground shadow-lg hover:shadow-xl transition-all flex items-center justify-center hover:scale-105"
        title="دليل الاستخدام"
        aria-label="فتح دليل الاستخدام"
      >
        <HelpCircle size={24} />
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent
          className="max-w-lg sm:max-w-xl max-h-[88vh] overflow-y-auto p-0 [&>button]:hidden border-2 border-primary/20 shadow-2xl rounded-2xl"
        >
          {/* Visible, large close button — start side in RTL */}
          <DialogClose
            aria-label="إغلاق دليل الاستخدام"
            className="absolute top-3 left-3 z-50 inline-flex items-center gap-1.5 rounded-full bg-background/95 backdrop-blur-sm border-2 border-border hover:border-destructive hover:bg-destructive hover:text-destructive-foreground text-foreground px-3 py-1.5 text-xs font-bold shadow-lg transition-all hover:scale-105 focus:outline-none focus-visible:ring-2 focus-visible:ring-destructive"
          >
            <X size={14} strokeWidth={3} />
            <span>إغلاق</span>
          </DialogClose>

          {/* Header — creative, compact, themed */}
          <div className="relative bg-gradient-to-bl from-primary via-primary/95 to-primary/80 text-primary-foreground p-4 pt-11 sm:pt-4 overflow-hidden">
            {/* زخارف خلفية */}
            <div className="absolute -top-10 -right-10 w-32 h-32 rounded-full bg-white/10 blur-2xl" />
            <div className="absolute -bottom-10 left-8 w-28 h-28 rounded-full bg-white/5 blur-3xl" />
            <DialogHeader className="relative">
              <DialogTitle className="flex items-center gap-2.5 text-base">
                <div className="w-10 h-10 rounded-xl bg-white/15 backdrop-blur-md flex items-center justify-center shadow-lg ring-2 ring-white/20">
                  <BookOpen size={18} />
                </div>
                <div className="flex flex-col text-right">
                  <span className="text-sm sm:text-base font-extrabold text-primary-foreground leading-tight">
                    دليل استخدام النظام
                  </span>
                  <span className="text-[10px] sm:text-[11px] font-medium text-primary-foreground/80 mt-0.5">
                    مدرسة اليعقوبي الثانوية — دليل تربوي مهني
                  </span>
                </div>
              </DialogTitle>
            </DialogHeader>

            <div className="relative mt-3 flex items-center gap-2 bg-white/15 backdrop-blur-md rounded-lg p-2 border border-white/20">
              <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center text-primary-foreground shrink-0">
                {isPrincipal ? <Crown size={14} /> : isTeacher ? <GraduationCap size={14} /> : <Users size={14} />}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[13px] font-extrabold text-primary-foreground truncate">{profile?.full_name || "—"}</p>
                <p className="text-[10px] text-primary-foreground/80 truncate">
                  {profile?.role_title}
                  {isPrincipal && " • صلاحيات كاملة"}
                  {isTeacher && " • وضع المشاهدة + ملاحظات صفية"}
                </p>
              </div>
            </div>
          </div>

          {/* Tabs */}
          <Tabs defaultValue="academic" className="w-full p-4 pt-2.5">
            <TabsList className="grid grid-cols-5 w-full h-auto">
              <TabsTrigger value="academic" className="text-[10px] sm:text-xs gap-1 py-2">
                <Calendar size={12} /> أكاديمي
              </TabsTrigger>
              <TabsTrigger value="overview" className="text-[10px] sm:text-xs gap-1 py-2">
                <ShieldCheck size={12} /> صلاحياتي
              </TabsTrigger>
              <TabsTrigger value="rules" className="text-[10px] sm:text-xs gap-1 py-2">
                <Eye size={12} /> القواعد
              </TabsTrigger>
              <TabsTrigger value="tips" className="text-[10px] sm:text-xs gap-1 py-2">
                <Lightbulb size={12} /> نصائح
              </TabsTrigger>
              <TabsTrigger value="contact" className="text-[10px] sm:text-xs gap-1 py-2">
                <MessageSquare size={12} /> تواصل
              </TabsTrigger>
            </TabsList>

            {/* TAB 0: Academic Info */}
            <TabsContent value="academic" className="mt-4 space-y-3">
              <AcademicInfoTab />
            </TabsContent>

            {/* TAB 1: Permissions */}
            <TabsContent value="overview" className="mt-4 space-y-4">
              {isPrincipal ? (
                <Section icon={<Crown size={16} />} title="مدير المدرسة — صلاحيات كاملة" tone="success" items={principalFeatures} />
              ) : isTeacher ? (
                <>
                  <Section icon={<CheckCircle2 size={16} />} title="ما يمكن للمعلم القيام به" tone="success" items={teacherFeatures} />
                  <Section icon={<XCircle size={16} />} title="ما لا يُسمح به للمعلم" tone="warn" items={teacherRestrictions} />
                </>
              ) : (
                <div className="rounded-xl border bg-card p-4">
                  <h3 className="text-sm font-bold text-foreground mb-3 flex items-center gap-2">
                    <ShieldCheck size={15} className="text-primary" /> صلاحياتك المعتمدة
                  </h3>
                  <div className="grid sm:grid-cols-2 gap-1.5">
                    {(Object.keys(PERMISSION_LABELS) as PermissionType[]).map((p) => {
                      const has = hasPermission(userId, false, p);
                      return (
                        <div key={p} className={`flex items-center gap-2 text-xs rounded-md px-2 py-1.5 border ${has ? "bg-success/5 border-success/20 text-foreground" : "bg-muted/30 border-border/40 text-muted-foreground/70"}`}>
                          {has ? <CheckCircle2 size={13} className="text-success shrink-0" /> : <XCircle size={13} className="text-muted-foreground/50 shrink-0" />}
                          <span className={has ? "font-medium" : ""}>{PERMISSION_LABELS[p]}</span>
                        </div>
                      );
                    })}
                  </div>
                  <p className="text-[11px] text-muted-foreground mt-3 leading-relaxed">
                    تُمنح هذه الصلاحيات من قِبَل مدير المدرسة وفق المهام الموكلة إليك، ويمكنك مراسلته من تبويب «تواصل» لطلب أي تعديل.
                  </p>
                </div>
              )}
            </TabsContent>

            {/* TAB 2: Rules */}
            <TabsContent value="rules" className="mt-4 space-y-3">
              {(() => {
                const can = (p: PermissionType) => isPrincipal || hasPermission(userId, false, p);
                const rules: Array<{ t: string; b: string; show: boolean; highlight?: boolean }> = [
                  { t: "هيكلة النظام", b: "ثلاثة أقسام: لوحة التحكم، شؤون الطلاب، شؤون المعلمين. يظهر لكل مستخدم ما يخصه فقط بحسب صلاحياته.", show: true, highlight: true },
                  { t: "شؤون الطلاب", b: "كشوف الطلاب، المواظبة، السلوك، الملاحظات الصفية، الإحالات، الإذونات وكشوف المتابعة في واجهة موحّدة.", show: isPrincipal || can("add_students") || can("edit_students") || can("record_late") || can("record_absent") || can("record_violation") || can("record_class_notes") },
                  { t: "شؤون المعلمين", b: "كشف حضوري الشهري واستيراد ملفات حضوري، ومركز أرشيف موحّد (خطابات، إجراءات، سجل المعلمين، أرشيف الأشهر).", show: isPrincipal || can("manage_teacher_affairs") || can("view_archive") },
                  { t: "المشاهدة فقط", b: "المواظبة والسلوك والمؤشرات متاحة للاطلاع فقط لمن لا يمتلك صلاحيات تنفيذية، دون طباعة أو إرسال أو تعديل.", show: isTeacher || (!isPrincipal && !can("edit_actions") && !can("delete_actions")) },
                  { t: "الإجراءات التنفيذية", b: "التعديل والحذف والإرسال والاعتماد والطباعة الرسمية محصورة بمدير المدرسة والمصرّح لهم.", show: isPrincipal || can("edit_actions") || can("delete_actions") || can("print_reports") || can("send_messages") },
                  { t: "إدارة الأرشيف", b: "تصفير وحذف الأرشيف وبدء سنة دراسية جديدة محصورة بمدير المدرسة فقط.", show: isPrincipal },
                  { t: "السلوك الإيجابي", b: "إضافة بنود السلوك المتميز محصورة بالمدير ووكيل شؤون الطلاب فقط.", show: isPrincipal || can("manage_distinguished") },
                  { t: "التواصل مع ولي الأمر", b: "لا يجوز للمعلم مراسلة ولي الأمر بخصوص الملاحظات الصفية؛ التواصل من قِبَل الإدارة فقط.", show: isTeacher || isPrincipal },
                ];
                return rules.filter((r) => r.show).map((r, i) => (
                  <RuleCard key={i} title={r.t} body={r.b} highlight={r.highlight} />
                ));
              })()}
            </TabsContent>

            {/* TAB 3: Tips */}
            <TabsContent value="tips" className="mt-4 space-y-2">
              {[
                "استخدم البحث السريع (Ctrl+K) للوصول لأي طالب فوراً.",
                "يمكنك مسح الباركود بكاميرا الجوال لتسجيل الحضور والتأخر بسرعة.",
                "جميع الإجراءات تُحفظ تلقائياً وتُزامَن لحظياً مع قاعدة البيانات.",
                "لوحة التحكم هي الصفحة الافتراضية لجميع المستخدمين عند الدخول.",
                "عند فقدان الاتصال، يعمل النظام في وضع عدم الاتصال وتُزامَن البيانات تلقائياً عند العودة.",
                "تأكد من اعتماد الإجراء قبل المغادرة لضمان وصوله للأرشيف الإلكتروني للطالب.",
              ].map((t, i) => (
                <div key={i} className="flex items-start gap-2 text-xs bg-muted/30 border border-border/40 rounded-lg px-3 py-2">
                  <Sparkles size={13} className="text-primary mt-0.5 shrink-0" />
                  <span className="text-foreground/90 leading-relaxed">{t}</span>
                </div>
              ))}
            </TabsContent>

            {/* TAB 4: Contact Principal */}
            <TabsContent value="contact" className="mt-4 space-y-3">
              {isPrincipal ? (
                <div className="rounded-xl border bg-gradient-to-bl from-primary/10 to-transparent p-4 text-center space-y-3">
                  <Crown size={22} className="mx-auto text-primary" />
                  <div>
                    <p className="text-sm font-bold text-foreground">أنت مدير المدرسة</p>
                    <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                      تصلك رسائل المعلمين والمستخدمين عبر جرس الإشعارات، ويمكنك فتح صندوق الرسائل للرد عليها مباشرة.
                    </p>
                  </div>
                  <Button
                    size="sm"
                    onClick={() => { setOpen(false); setTimeout(() => setInboxOpen(true), 200); }}
                    className="gap-1.5 w-full"
                  >
                    <MessageSquare size={14} /> فتح صندوق رسائل المعلمين
                  </Button>
                </div>
              ) : (
                <>
                  <div className="rounded-xl border bg-card p-4">
                    <h3 className="text-sm font-bold text-foreground mb-1 flex items-center gap-2">
                      <Send size={14} className="text-primary" /> مراسلة مدير المدرسة
                    </h3>
                    <p className="text-[11px] text-muted-foreground mb-3 leading-relaxed">
                      أرسل ملاحظتك أو استفسارك أو طلب الدعم مباشرة إلى{" "}
                      <span className="font-semibold text-foreground">{principal?.full_name || PRINCIPAL_NAME}</span>، وسيتم إشعاره فوراً.
                    </p>
                    <div className="grid grid-cols-4 gap-1.5 mb-2">
                      {([{ key: "question", label: "استفسار" }, { key: "need", label: "احتياج" }, { key: "note", label: "ملاحظة" }, { key: "support", label: "دعم" }] as const).map((opt) => (
                        <button key={opt.key} onClick={() => setContactType(opt.key)} className={`text-[11px] py-1.5 rounded-md border transition-colors ${contactType === opt.key ? "bg-primary text-primary-foreground border-primary" : "bg-background text-foreground border-border hover:bg-muted"}`}>
                          {opt.label}
                        </button>
                      ))}
                    </div>
                    <Textarea value={contactMsg} onChange={(e) => setContactMsg(e.target.value)} placeholder="اكتب رسالتك بأسلوب تربوي ومهني..." className="min-h-[90px] text-sm resize-none" maxLength={500} />
                    <div className="flex items-center justify-between mt-2">
                      <span className="text-[10px] text-muted-foreground">{contactMsg.length}/500</span>
                      <Button size="sm" onClick={handleSendToPrincipal} disabled={sending || !contactMsg.trim() || !principal} className="gap-1.5">
                        <Send size={13} /> {sending ? "جاري الإرسال..." : "إرسال للمدير"}
                      </Button>
                    </div>
                  </div>
                  {conversation.length > 0 && (
                    <div className="rounded-xl border bg-gradient-to-b from-muted/20 to-transparent p-3 space-y-2.5">
                      <div className="flex items-center gap-2 mb-1">
                        <MessageSquare size={13} className="text-primary" />
                        <h4 className="text-xs font-bold text-foreground">المحادثات السابقة مع المدير</h4>
                      </div>
                      <div className="max-h-64 overflow-y-auto space-y-2.5 pl-1">
                        {conversation.map((c) => <ConversationBubble key={c.id} item={c} />)}
                      </div>
                    </div>
                  )}
                </>
              )}
            </TabsContent>
          </Tabs>

          <div className="px-5 pb-5 pt-3 space-y-3 border-t bg-gradient-to-t from-muted/40 to-transparent">
            <div className="flex gap-2">
              <Button
                onClick={handleDismiss}
                variant="default"
                className="flex-1 gap-1.5 font-bold"
                size="sm"
              >
                <CheckCircle2 size={14} />
                فهمت، عدم الإظهار مجدداً
              </Button>
              <Button
                onClick={() => setOpen(false)}
                variant="outline"
                className="gap-1.5"
                size="sm"
              >
                <X size={14} />
                إغلاق
              </Button>
            </div>
            <div className="flex items-center justify-center gap-1.5 text-[11px] text-muted-foreground">
              <Code2 size={12} />
              <span>تنفيذ وتطوير وتصميم:</span>
              <span className="font-bold text-foreground">فهد حامد الزهراني</span>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {isPrincipal && <PrincipalContactInbox open={inboxOpen} onOpenChange={setInboxOpen} />}
    </>
  );
};

export default UserGuideDialog;