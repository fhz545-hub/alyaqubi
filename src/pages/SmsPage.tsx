import { useState, useMemo, useEffect, useCallback } from "react";
import AppLayout from "@/components/AppLayout";
import { getActions, loadActions } from "@/store/actionsStore";
import { loadStudents, getStudentsFromDB } from "@/store/studentsStore";
import { Student, StudentAction } from "@/types/school";
import { useAuth } from "@/contexts/AuthContext";
import { hasPermission } from "@/store/permissionsStore";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import {
  MessageSquare, CalendarIcon, Filter, Settings, Clock, UserX, AlertTriangle, LogOut,
  ShieldAlert, Lock, CheckCircle2, BookOpen, TrendingUp, Megaphone, Bell,
} from "lucide-react";
import { toast } from "@/hooks/use-toast";
import SmsBalanceCard from "@/components/sms/SmsBalanceCard";
import SmsTabContent from "@/components/sms/SmsTabContent";
import SmsFrequencyTab from "@/components/sms/SmsFrequencyTab";
import SmsBroadcastTab from "@/components/sms/SmsBroadcastTab";
import SmsAlertsTab from "@/components/sms/SmsAlertsTab";
import SmsArchive, { SmsArchiveEntry } from "@/components/sms/SmsArchive";
import { SMS_TABS, SmsTabKey } from "@/utils/smsTemplates";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";

const GRADE_OPTIONS = [
  { code: "1314", name: "أول ثانوي" },
  { code: "1416", name: "ثاني ثانوي" },
  { code: "1516", name: "ثالث ثانوي" },
];

const TAB_CONFIG: Record<SmsTabKey, { icon: React.ReactNode; gradient: string; activeBg: string; activeText: string; borderColor: string; emoji: string }> = {
  late: {
    icon: <Clock size={16} />,
    gradient: "from-amber-500/10 to-orange-500/10",
    activeBg: "bg-gradient-to-br from-amber-500 to-orange-500",
    activeText: "text-white",
    borderColor: "border-amber-300 dark:border-amber-700",
    emoji: "⏰",
  },
  absent: {
    icon: <UserX size={16} />,
    gradient: "from-red-500/10 to-rose-500/10",
    activeBg: "bg-gradient-to-br from-red-500 to-rose-500",
    activeText: "text-white",
    borderColor: "border-red-300 dark:border-red-700",
    emoji: "🚫",
  },
  violation: {
    icon: <AlertTriangle size={16} />,
    gradient: "from-orange-500/10 to-red-500/10",
    activeBg: "bg-gradient-to-br from-orange-500 to-red-600",
    activeText: "text-white",
    borderColor: "border-orange-300 dark:border-orange-700",
    emoji: "⚠️",
  },
  permission: {
    icon: <LogOut size={16} />,
    gradient: "from-blue-500/10 to-cyan-500/10",
    activeBg: "bg-gradient-to-br from-blue-500 to-cyan-500",
    activeText: "text-white",
    borderColor: "border-blue-300 dark:border-blue-700",
    emoji: "🚪",
  },
  class_notes: {
    icon: <BookOpen size={16} />,
    gradient: "from-purple-500/10 to-violet-500/10",
    activeBg: "bg-gradient-to-br from-purple-500 to-violet-500",
    activeText: "text-white",
    borderColor: "border-purple-300 dark:border-purple-700",
    emoji: "📝",
  },
  frequency: {
    icon: <TrendingUp size={16} />,
    gradient: "from-emerald-500/10 to-teal-500/10",
    activeBg: "bg-gradient-to-br from-emerald-500 to-teal-600",
    activeText: "text-white",
    borderColor: "border-emerald-300 dark:border-emerald-700",
    emoji: "📊",
  },
  broadcast: {
    icon: <Megaphone size={16} />,
    gradient: "from-indigo-500/10 to-blue-500/10",
    activeBg: "bg-gradient-to-br from-indigo-500 to-blue-600",
    activeText: "text-white",
    borderColor: "border-indigo-300 dark:border-indigo-700",
    emoji: "📢",
  },
  alerts: {
    icon: <Bell size={16} />,
    gradient: "from-pink-500/10 to-rose-500/10",
    activeBg: "bg-gradient-to-br from-pink-500 to-rose-500",
    activeText: "text-white",
    borderColor: "border-pink-300 dark:border-pink-700",
    emoji: "🔔",
  },
};

const DAILY_TABS: SmsTabKey[] = ["late", "absent", "violation", "permission", "class_notes"];
const CLASS_NOTE_TYPES = ["class_late", "class_escape", "class_chaos", "no_homework", "sleeping", "class_note"];

const SmsPage = () => {
  const { profile } = useAuth();
  const [actions, setActions] = useState<StudentAction[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [loading, setLoading] = useState(true);

  const isPrincipal = profile?.is_principal ?? false;
  const canSend = isPrincipal || hasPermission(profile?.user_id ?? "", false, "send_messages");

  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [filterGrade, setFilterGrade] = useState<string>("all");
  const [filterSection, setFilterSection] = useState<string>("all");
  const [activeTab, setActiveTab] = useState<SmsTabKey>("late");

  const [apiToken, setApiToken] = useState("");
  const [senderName, setSenderName] = useState("school1");
  const [showSettings, setShowSettings] = useState(false);
  const [savingSettings, setSavingSettings] = useState(false);
  const [settingsLoaded, setSettingsLoaded] = useState(false);
  const [editToken, setEditToken] = useState("");
  const [editSender, setEditSender] = useState("school1");

  const [archive, setArchive] = useState<SmsArchiveEntry[]>(() => {
    try { return JSON.parse(localStorage.getItem("sms_archive") || "[]"); } catch { return []; }
  });

  const loadSettings = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from("school_settings")
        .select("key, value")
        .in("key", ["sms_api_token", "sms_sender_name"]);
      if (error) { console.error("Failed to load settings:", error); return; }
      const settings: Record<string, string> = {};
      (data || []).forEach((row: any) => { settings[row.key] = row.value; });
      const token = settings["sms_api_token"] || "";
      const sender = settings["sms_sender_name"] || "school1";
      setApiToken(token);
      setSenderName(sender);
      setEditToken(token);
      setEditSender(sender);
      setSettingsLoaded(true);
    } catch (err) { console.error("Error loading settings:", err); }
  }, []);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      await Promise.all([loadActions(), loadStudents(), loadSettings()]);
      setActions(getActions());
      setStudents(getStudentsFromDB());
      setLoading(false);
    };
    load();
  }, [loadSettings]);

  useEffect(() => { localStorage.setItem("sms_archive", JSON.stringify(archive.slice(0, 500))); }, [archive]);

  const handleSaveSettings = async () => {
    if (!isPrincipal) return;
    setSavingSettings(true);
    try {
      const userId = profile?.user_id;
      await supabase.from("school_settings").upsert(
        { key: "sms_api_token", value: editToken.trim(), updated_by: userId, updated_at: new Date().toISOString() },
        { onConflict: "key" }
      );
      await supabase.from("school_settings").upsert(
        { key: "sms_sender_name", value: editSender.trim(), updated_by: userId, updated_at: new Date().toISOString() },
        { onConflict: "key" }
      );
      setApiToken(editToken.trim());
      setSenderName(editSender.trim());
      toast({ title: "✓ تم حفظ الإعدادات بنجاح" });
      setShowSettings(false);
    } catch { toast({ title: "فشل في حفظ الإعدادات", variant: "destructive" }); }
    finally { setSavingSettings(false); }
  };

  const dateStr = format(selectedDate, "yyyy-MM-dd");

  const studentGradeMap = useMemo(() => {
    const map = new Map<string, string>();
    students.forEach(s => map.set(s.id, s.gradeCode));
    return map;
  }, [students]);

  const filteredActions = useMemo(() => {
    return actions.filter(a => {
      if (a.date !== dateStr) return false;
      if (filterGrade !== "all" && studentGradeMap.get(a.studentId) !== filterGrade) return false;
      if (filterSection !== "all" && String(a.section) !== filterSection) return false;
      return true;
    });
  }, [actions, dateStr, filterGrade, filterSection, studentGradeMap]);

  const allActions = useMemo(() => actions, [actions]);

  const availableSections = useMemo(() => {
    const sections = new Set<number>();
    actions.filter(a => a.date === dateStr).forEach(a => sections.add(a.section));
    return Array.from(sections).sort((a, b) => a - b);
  }, [actions, dateStr]);

  const tabCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    const seen: Record<string, Set<string>> = {};
    for (const tab of SMS_TABS) { counts[tab.key] = 0; seen[tab.key] = new Set(); }
    for (const a of filteredActions) {
      if (a.type === "late" || a.type === "absent" || a.type === "violation" || a.type === "permission") {
        const key = `${a.studentId}-${a.type}`;
        if (!seen[a.type].has(key)) { seen[a.type].add(key); counts[a.type]++; }
      }
      if (CLASS_NOTE_TYPES.includes(a.type)) {
        const key = `${a.studentId}-${a.type}`;
        if (!seen["class_notes"].has(key)) { seen["class_notes"].add(key); counts["class_notes"]++; }
      }
    }
    return counts;
  }, [filteredActions]);

  const handleArchiveAdd = (entries: SmsArchiveEntry[]) => {
    setArchive(prev => [...entries, ...prev]);
  };

  if (!canSend) {
    return (
      <AppLayout>
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <ShieldAlert size={48} className="text-muted-foreground/30 mb-4" />
          <h2 className="text-lg font-bold text-foreground mb-2">لا تملك صلاحية الوصول</h2>
          <p className="text-sm text-muted-foreground">إرسال الرسائل متاح للوكيل أو من يمنحه المدير صلاحية الإرسال</p>
        </div>
      </AppLayout>
    );
  }

  const renderTabContent = () => {
    if (activeTab === "frequency") {
      return <SmsFrequencyTab actions={allActions} students={students} apiToken={apiToken} senderName={senderName} onArchiveAdd={handleArchiveAdd} />;
    }
    if (activeTab === "broadcast") {
      return <SmsBroadcastTab students={students} apiToken={apiToken} senderName={senderName} onArchiveAdd={handleArchiveAdd} />;
    }
    if (activeTab === "alerts") {
      return <SmsAlertsTab actions={filteredActions} students={students} apiToken={apiToken} senderName={senderName} onArchiveAdd={handleArchiveAdd} />;
    }
    return <SmsTabContent tabKey={activeTab} actions={filteredActions} students={students} apiToken={apiToken} senderName={senderName} onArchiveAdd={handleArchiveAdd} />;
  };

  return (
    <AppLayout>
      <div className="space-y-6">
        {/* Hero Header */}
        <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-primary via-primary/90 to-primary/70 p-5 sm:p-6 text-primary-foreground shadow-xl">
          <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNDAiIGhlaWdodD0iNDAiIHZpZXdCb3g9IjAgMCA0MCA0MCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48Y2lyY2xlIGN4PSIyMCIgY3k9IjIwIiByPSIxIiBmaWxsPSJyZ2JhKDI1NSwyNTUsMjU1LDAuMDUpIi8+PC9zdmc+')] opacity-50" />
          <div className="relative flex items-center justify-between flex-wrap gap-3">
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 rounded-2xl bg-white/15 backdrop-blur-sm flex items-center justify-center shadow-lg border border-white/20">
                <MessageSquare size={28} className="text-white" />
              </div>
              <div>
                <h1 className="text-xl sm:text-2xl font-black tracking-tight">مركز الرسائل</h1>
                <p className="text-xs sm:text-sm text-white/70 mt-0.5">إرسال رسائل SMS • تصدير • أرشيف</p>
              </div>
            </div>
            {isPrincipal && (
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setShowSettings(!showSettings)}
                className="gap-2 text-xs bg-white/15 hover:bg-white/25 text-white border-white/20 backdrop-blur-sm"
              >
                <Settings size={14} />
                <span>إعدادات API</span>
              </Button>
            )}
          </div>
        </div>

        {/* API Settings - Principal Only */}
        {isPrincipal && showSettings && (
          <div className="rounded-2xl border-2 border-primary/20 bg-card p-5 space-y-4 shadow-lg animate-in slide-in-from-top-2 duration-300">
            <div className="flex items-center gap-2 flex-wrap">
              <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
                <Lock size={16} className="text-primary" />
              </div>
              <h3 className="text-sm font-bold text-foreground">إعدادات Orbit API</h3>
              <span className="text-[10px] bg-destructive/10 text-destructive px-2 py-0.5 rounded-full font-bold">للمدير فقط</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-foreground mb-1 block">API Token</label>
                <Input type="password" value={editToken} onChange={e => setEditToken(e.target.value)} placeholder="أدخل التوكن..." dir="ltr" className="border-2 focus:border-primary" />
              </div>
              <div>
                <label className="text-xs font-medium text-foreground mb-1 block">اسم المرسل</label>
                <Input value={editSender} onChange={e => setEditSender(e.target.value)} placeholder="school1" dir="ltr" className="border-2 focus:border-primary" />
              </div>
            </div>
            <Button onClick={handleSaveSettings} disabled={savingSettings} className="gap-2 text-xs w-full sm:w-auto">
              {savingSettings ? <span className="animate-spin">⏳</span> : <CheckCircle2 size={14} />}
              حفظ الإعدادات
            </Button>
          </div>
        )}

        {/* Non-principal info */}
        {!isPrincipal && (
          <div className="rounded-xl border border-border bg-muted/30 p-3 flex items-center gap-2 text-xs text-muted-foreground">
            <Lock size={12} />
            <span>إعدادات API يديرها المدير — يمكنك الإرسال بالصلاحية الممنوحة لك</span>
          </div>
        )}

        {/* Balance */}
        {settingsLoaded && apiToken && <SmsBalanceCard apiToken={apiToken} />}

        {/* Filters (for daily tabs) */}
        {DAILY_TABS.includes(activeTab) && (
          <div className="rounded-2xl border border-border bg-card p-4 space-y-3 shadow-sm">
            <h3 className="text-sm font-bold text-foreground flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center">
                <Filter size={14} className="text-primary" />
              </div>
              الفلاتر
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 sm:gap-3">
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className="justify-start text-right text-xs font-normal w-full border-2">
                    <CalendarIcon size={14} className="ml-2" />
                    {format(selectedDate, "yyyy/MM/dd")}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar mode="single" selected={selectedDate} onSelect={d => d && setSelectedDate(d)} className="p-3 pointer-events-auto" />
                </PopoverContent>
              </Popover>
              <Select value={filterGrade} onValueChange={setFilterGrade}>
                <SelectTrigger className="text-xs border-2"><SelectValue placeholder="المرحلة" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">جميع المراحل</SelectItem>
                  {GRADE_OPTIONS.map(g => <SelectItem key={g.code} value={g.code}>{g.name}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={filterSection} onValueChange={setFilterSection}>
                <SelectTrigger className="text-xs border-2"><SelectValue placeholder="الشعبة" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">جميع الشعب</SelectItem>
                  {availableSections.map(s => <SelectItem key={s} value={String(s)}>فصل {s}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
        )}

        {/* Tab Cards Grid */}
        {loading ? (
          <div className="text-center py-12">
            <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-3" />
            <p className="text-sm text-muted-foreground">جاري التحميل...</p>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-4 sm:grid-cols-4 lg:grid-cols-8 gap-2 sm:gap-3">
              {SMS_TABS.map(tab => {
                const config = TAB_CONFIG[tab.key];
                const isActive = activeTab === tab.key;
                const count = tabCounts[tab.key] || 0;

                return (
                  <button
                    key={tab.key}
                    onClick={() => setActiveTab(tab.key)}
                    className={cn(
                      "relative group flex flex-col items-center gap-1 sm:gap-1.5 p-2.5 sm:p-3 rounded-2xl border-2 transition-all duration-300 cursor-pointer",
                      isActive
                        ? `${config.activeBg} ${config.activeText} border-transparent shadow-lg scale-[1.03]`
                        : `bg-gradient-to-br ${config.gradient} ${config.borderColor} hover:shadow-md hover:scale-[1.02]`
                    )}
                  >
                    {/* Glow effect for active */}
                    {isActive && (
                      <div className="absolute inset-0 rounded-2xl bg-white/10 animate-pulse" />
                    )}

                    <span className="text-base sm:text-lg relative z-10">{config.emoji}</span>
                    <span className={cn(
                      "text-[9px] sm:text-[10px] font-bold relative z-10 leading-tight text-center",
                      isActive ? "text-white" : "text-foreground"
                    )}>
                      {tab.label}
                    </span>

                    {count > 0 && (
                      <span className={cn(
                        "absolute -top-1 -left-1 sm:-top-1.5 sm:-left-1.5 min-w-[18px] sm:min-w-[20px] h-[18px] sm:h-[20px] flex items-center justify-center rounded-full text-[9px] sm:text-[10px] font-black shadow-md z-20",
                        isActive
                          ? "bg-white text-foreground"
                          : "bg-primary text-primary-foreground"
                      )}>
                        {count}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>

            {/* Active section header */}
            <div className={cn(
              "rounded-2xl border-2 p-4 flex items-center gap-3",
              TAB_CONFIG[activeTab].borderColor,
              `bg-gradient-to-l ${TAB_CONFIG[activeTab].gradient}`
            )}>
              <span className="text-2xl">{TAB_CONFIG[activeTab].emoji}</span>
              <div>
                <h2 className="text-sm sm:text-base font-black text-foreground">
                  {SMS_TABS.find(t => t.key === activeTab)?.label}
                </h2>
                <p className="text-[10px] text-muted-foreground">
                  {activeTab === "frequency" ? "عرض الطلاب الأكثر تكراراً في جميع الفترات" :
                   activeTab === "broadcast" ? "إرسال رسالة جماعية لأولياء الأمور" :
                   activeTab === "alerts" ? "تنبيهات الخروج والتنبيهات العامة" :
                   `سجلات اليوم ${format(selectedDate, "yyyy/MM/dd")}`}
                </p>
              </div>
              {(tabCounts[activeTab] || 0) > 0 && (
                <span className={cn(
                  "mr-auto px-3 py-1 rounded-full text-xs font-bold",
                  TAB_CONFIG[activeTab].activeBg,
                  TAB_CONFIG[activeTab].activeText
                )}>
                  {tabCounts[activeTab]} رسالة
                </span>
              )}
            </div>

            {/* Tab Content */}
            <div className="animate-in fade-in-50 duration-300">
              {renderTabContent()}
            </div>
          </>
        )}

        {/* Archive */}
        <SmsArchive
          entries={archive}
          onClear={() => {
            setArchive([]);
            localStorage.removeItem("sms_archive");
            toast({ title: "تم مسح الأرشيف" });
          }}
        />
      </div>
    </AppLayout>
  );
};

export default SmsPage;
