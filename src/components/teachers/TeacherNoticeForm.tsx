import { useEffect, useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { Save, MessageCircle } from "lucide-react";
import {
  listTeachers, createNotice, type Teacher,
} from "@/utils/teachersApi";
import {
  type SeasonMode, calcLateMinutes, calcAbsenceMinutes, fmtHM,
  formatHijri, formatGreg, dayName, SHIFT_CFG, getEffectiveShift, fromMin,
} from "@/utils/teacherShifts";
import { logAudit } from "@/utils/auditLog";
import { useAuth } from "@/contexts/AuthContext";
import TeacherNoticePrint from "./TeacherNoticePrint";

export type NoticeKind = "late" | "absent" | "gaib" | "note";

const KIND_LABELS: Record<NoticeKind, string> = {
  late: "خطاب تنبيه — تأخر",
  absent: "خطاب تنبيه — عدم تواجد",
  gaib: "محضر مساءلة عن غياب",
  note: "نموذج لفت نظر",
};

const NOTE_REASONS = [
  "عدم المشاركة في الإشراف الصباحي وفق الجدول المعتمد.",
  "التقصير في مناوبة نهاية الدوام مما أثّر على انضباط خروج الطلاب.",
  "قصور في الحضور أثناء الإشراف وقت الفسحة مما أدى إلى ضعف متابعة السلوك الطلابي.",
  "عدم الإشراف على صلاة الظهر في المصلى المدرسي.",
  "عدم التحضير الإلكتروني في منصة مدرستي حسب المتطلبات.",
  "الخروج من الحصة قبل انتهائها دون مبرر نظامي.",
  "التأخر عن دخول الحصة وفق الجدول الزمني.",
  "عدم الحضور للطابور الصباحي دون عذر.",
  "التغيب عن اجتماع المدرسة الرسمي دون عذر.",
  "عدم الرد على مساءلة إدارية في الموعد المحدد.",
  "رفض التوقيع على النماذج أو المحاضر الرسمية.",
  "رفض تنفيذ توجيه إداري أو تربوي دون مبرر.",
  "عدم رفع بيانات الغياب في (فارس) بالوقت المحدد.",
  "عدم دخول حصة الانتظار المكلَّف بها.",
  "عدم دخول الحصة الرسمية والخروج بدون استئذان.",
  "التقصير في إدخال الدرجات في (نور) ضمن الإطار الزمني المعتمد.",
  "عدم تسجيل الانصراف في منصة حضوري.",
];

interface FormState {
  kind: NoticeKind;
  teacherId: string;
  date: string; // yyyy-mm-dd
  season: SeasonMode;
  extended: boolean;
  lateIn: string;
  absFrom: string;
  absTo: string;
  noteReason: string;
  lessonClass: string;
  lessonPeriod: string;
  lessonMinutes: string;
}

const todayISO = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

const initialForm: FormState = {
  kind: "late",
  teacherId: "",
  date: todayISO(),
  season: "summer",
  extended: false,
  lateIn: "",
  absFrom: "",
  absTo: "",
  noteReason: "",
  lessonClass: "",
  lessonPeriod: "",
  lessonMinutes: "",
};

export default function TeacherNoticeForm() {
  const { profile } = useAuth();
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [form, setForm] = useState<FormState>(initialForm);
  const [saving, setSaving] = useState(false);
  const [showPrint, setShowPrint] = useState(false);

  useEffect(() => {
    listTeachers().then(setTeachers).catch((err) => toast.error("تعذّر تحميل المعلمين: " + err.message));
  }, []);

  const teacher = useMemo(
    () => teachers.find((t) => t.id === form.teacherId) || null,
    [teachers, form.teacherId]
  );

  const dateObj = useMemo(() => {
    const [y, m, d] = form.date.split("-").map((n) => parseInt(n, 10));
    return new Date(y, (m || 1) - 1, d || 1);
  }, [form.date]);

  const lateMin = useMemo(
    () => calcLateMinutes(form.lateIn, form.season, form.extended),
    [form.lateIn, form.season, form.extended]
  );

  const absMin = useMemo(
    () => calcAbsenceMinutes(form.absFrom, form.absTo),
    [form.absFrom, form.absTo]
  );

  const cfg = useMemo(() => getEffectiveShift(form.season, form.extended), [form.season, form.extended]);

  const update = <K extends keyof FormState>(k: K, v: FormState[K]) => setForm((f) => ({ ...f, [k]: v }));

  const isLessonReason = useMemo(() => {
    return /التأخر عن دخول الحصة|الخروج من الحصة قبل انتهائها/.test(form.noteReason);
  }, [form.noteReason]);

  const validate = (): string | null => {
    if (!teacher) return "اختر المعلم أولاً";
    if (!form.date) return "اختر التاريخ";
    if (form.kind === "late" && !form.lateIn) return "أدخل وقت دخول المعلم";
    if (form.kind === "absent" && (!form.absFrom || !form.absTo)) return "أدخل وقت بداية ونهاية عدم التواجد";
    if (form.kind === "absent" && absMin <= 0) return "تحقق من أوقات عدم التواجد";
    if (form.kind === "note" && !form.noteReason) return "اختر سبب لفت النظر";
    return null;
  };

  const buildPayload = () => {
    return {
      teacher_id: teacher!.id,
      teacher_name: teacher!.full_name,
      teacher_civil_id: teacher!.civil_id,
      teacher_phone: teacher!.phone,
      notice_kind: form.kind,
      greg_date: formatGreg(dateObj),
      hijri_date: formatHijri(dateObj),
      day_name: dayName(dateObj),
      late_in_time: form.kind === "late" ? form.lateIn : "",
      late_total_min: form.kind === "late" ? lateMin : 0,
      abs_from_time: form.kind === "absent" ? form.absFrom : "",
      abs_to_time: form.kind === "absent" ? form.absTo : "",
      abs_total_min: form.kind === "absent" ? absMin : 0,
      note_reason: form.kind === "note" ? form.noteReason : "",
      lesson_class: form.kind === "note" && isLessonReason ? form.lessonClass : "",
      lesson_period: form.kind === "note" && isLessonReason ? form.lessonPeriod : "",
      lesson_minutes: form.kind === "note" && isLessonReason ? parseInt(form.lessonMinutes || "0", 10) : 0,
      season_mode: form.season,
      shift_extended: form.extended,
      created_by: profile?.user_id || null,
      created_by_name: profile?.full_name || "",
    };
  };

  const saveAndPrint = async () => {
    const err = validate();
    if (err) return toast.error(err);
    setSaving(true);
    try {
      const payload = buildPayload();
      const created = await createNotice(payload);
      toast.success("تم حفظ الإشعار في الأرشيف");
      logAudit(
        {
          action: "create", section: "teacher_affairs",
          entity_type: "teacher_notice", entity_id: created.id,
          details: { kind: form.kind, teacher: teacher!.full_name, serial: created.serial_number },
        },
        { id: profile?.user_id, name: profile?.full_name, role: profile?.role_title }
      );
      setShowPrint(true);
      setTimeout(() => {
        window.print();
        setShowPrint(false);
      }, 200);
    } catch (e: any) {
      toast.error("تعذّر الحفظ: " + e.message);
    } finally {
      setSaving(false);
    }
  };

  const sendWhatsApp = () => {
    const err = validate();
    if (err) return toast.error(err);
    if (!teacher) return;
    const kindLabel: Record<NoticeKind, string> = {
      late: "تنبيه تأخر",
      absent: "تنبيه عدم تواجد",
      gaib: "مساءلة غياب",
      note: "لفت نظر",
    };
    let details = "";
    if (form.kind === "late") {
      details = `تأخّر عن بداية الدوام الرسمي، ووقت الحضور: ${form.lateIn}؛ نأمل معالجة السبب والالتزام بمواعيد العمل.`;
    } else if (form.kind === "absent") {
      details = `عدم تواجد خلال ساعات الدوام من ${form.absFrom} إلى ${form.absTo}؛ نأمل إيضاح السبب وإرفاق ما يؤيده.`;
    } else if (form.kind === "gaib") {
      details = `تم تسجيل مساءلة غياب لليوم الموضّح.`;
    } else if (form.kind === "note") {
      const extra = isLessonReason && form.lessonClass
        ? ` — الفصل: ${form.lessonClass} — الحصة: ${form.lessonPeriod || "—"}`
        : "";
      details = `لفت نظر بسبب: ${form.noteReason}${extra}`;
    }
    const msg = `السلام عليكم
${kindLabel[form.kind]}
الاسم: ${teacher.full_name}
اليوم: ${dayName(dateObj)}
التاريخ (هـ): ${formatHijri(dateObj)}
${details}
*نظام الشؤون الإدارية والمتابعة*`;
    const phone = (teacher.phone || "").replace(/\D/g, "") || "966500000000";
    window.open(`https://wa.me/${phone}?text=${encodeURIComponent(msg)}`, "_blank");
  };

  const previewData = teacher
    ? {
        ...buildPayload(),
        id: "preview",
        serial_number: 0,
        created_at: new Date().toISOString(),
      }
    : null;

  return (
    <div className="grid lg:grid-cols-[380px,1fr] gap-4">
      <div className="space-y-4 print:hidden">
        <Card className="p-4 space-y-3">
          <div>
            <Label className="text-xs font-bold text-primary">نوع الإجراء</Label>
            <div className="grid grid-cols-2 gap-1.5 mt-1.5">
              {(Object.keys(KIND_LABELS) as NoticeKind[]).map((k) => (
                <Button
                  key={k}
                  size="sm"
                  variant={form.kind === k ? "default" : "outline"}
                  onClick={() => update("kind", k)}
                  className="text-xs h-9"
                >
                  {KIND_LABELS[k].split("—")[0]}
                </Button>
              ))}
            </div>
          </div>

          <div>
            <Label className="text-xs font-bold text-primary">المعلّم</Label>
            <Select value={form.teacherId} onValueChange={(v) => update("teacherId", v)}>
              <SelectTrigger className="mt-1.5"><SelectValue placeholder="— اختر المعلم —" /></SelectTrigger>
              <SelectContent>
                {teachers.length === 0 && (
                  <div className="p-3 text-center text-sm text-muted-foreground">
                    لا يوجد معلمون. أضفهم من تبويب "سجل المعلمين".
                  </div>
                )}
                {teachers.map((t) => (
                  <SelectItem key={t.id} value={t.id}>
                    {t.full_name}{t.specialization ? ` — ${t.specialization}` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label className="text-xs font-bold text-primary">التاريخ</Label>
            <Input type="date" value={form.date} onChange={(e) => update("date", e.target.value)} className="mt-1.5" />
            <p className="text-xs text-muted-foreground mt-1">
              {dayName(dateObj)} — {formatHijri(dateObj)}
            </p>
          </div>

          <div>
            <Label className="text-xs font-bold text-primary">توقيت الدوام</Label>
            <div className="grid grid-cols-3 gap-1.5 mt-1.5">
              {(["winter", "summer", "ramadan"] as SeasonMode[]).map((s) => (
                <Button
                  key={s}
                  size="sm"
                  variant={form.season === s ? "default" : "outline"}
                  onClick={() => update("season", s)}
                  className="text-xs h-9"
                >
                  {SHIFT_CFG[s].label}
                </Button>
              ))}
            </div>
            <div className="flex items-center justify-between mt-2 p-2 bg-muted/50 rounded">
              <Label className="text-xs">تمديد +30 دقيقة</Label>
              <Switch checked={form.extended} onCheckedChange={(v) => update("extended", v)} />
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              الدوام: {fromMin(cfg.startMin)} – {fromMin(cfg.endMin)}
            </p>
          </div>
        </Card>

        {form.kind === "late" && (
          <Card className="p-4 space-y-3">
            <Label className="text-xs font-bold text-primary">وقت دخول المعلم</Label>
            <Input type="time" value={form.lateIn} onChange={(e) => update("lateIn", e.target.value)} />
            {lateMin > 0 && (
              <div className="text-sm text-warning font-bold">
                إجمالي التأخر: {lateMin} دقيقة ({fmtHM(lateMin)})
              </div>
            )}
          </Card>
        )}

        {form.kind === "absent" && (
          <Card className="p-4 space-y-3">
            <Label className="text-xs font-bold text-primary">من الساعة</Label>
            <Input type="time" value={form.absFrom} onChange={(e) => update("absFrom", e.target.value)} />
            <Label className="text-xs font-bold text-primary">إلى الساعة</Label>
            <Input type="time" value={form.absTo} onChange={(e) => update("absTo", e.target.value)} />
            {absMin > 0 && (
              <div className="text-sm text-destructive font-bold">
                مدة عدم التواجد: {absMin} دقيقة ({fmtHM(absMin)})
              </div>
            )}
          </Card>
        )}

        {form.kind === "note" && (
          <Card className="p-4 space-y-3">
            <Label className="text-xs font-bold text-primary">سبب لفت النظر</Label>
            <Select value={form.noteReason} onValueChange={(v) => update("noteReason", v)}>
              <SelectTrigger><SelectValue placeholder="— اختر السبب —" /></SelectTrigger>
              <SelectContent>
                {NOTE_REASONS.map((r) => (
                  <SelectItem key={r} value={r} className="text-xs">{r}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {isLessonReason && (
              <div className="space-y-2 pt-2 border-t">
                <Label className="text-xs font-bold text-primary">تفاصيل الحصة</Label>
                <Input
                  placeholder="الفصل (مثال: ثاني ثانوي/3)"
                  value={form.lessonClass}
                  onChange={(e) => update("lessonClass", e.target.value)}
                />
                <div className="grid grid-cols-2 gap-2">
                  <Input
                    placeholder="رقم الحصة"
                    type="number" min="1" max="7"
                    value={form.lessonPeriod}
                    onChange={(e) => update("lessonPeriod", e.target.value)}
                  />
                  <Input
                    placeholder="عدد الدقائق"
                    type="number" min="0"
                    value={form.lessonMinutes}
                    onChange={(e) => update("lessonMinutes", e.target.value)}
                  />
                </div>
              </div>
            )}
          </Card>
        )}

        <div className="space-y-2">
          <Button className="w-full" size="lg" onClick={saveAndPrint} disabled={saving || !teacher}>
            {saving ? "جارٍ الحفظ..." : (
              <>
                <Save className="w-4 h-4 ml-2" />
                حفظ في الأرشيف وطباعة
              </>
            )}
          </Button>
          <Button
            type="button"
            className="w-full bg-[#25D366] hover:bg-[#1aae53] text-white"
            size="lg"
            onClick={sendWhatsApp}
            disabled={!teacher}
          >
            <MessageCircle className="w-4 h-4 ml-2" />
            إرسال واتساب
          </Button>
        </div>
      </div>

      {/* Preview / Print */}
      <div>
        {previewData ? (
          <TeacherNoticePrint
            data={previewData}
            teacher={teacher!}
            principalName={profile?.full_name || "مدير المدرسة"}
          />
        ) : (
          <Card className="p-12 text-center text-muted-foreground">
            اختر المعلم لعرض الخطاب الرسمي
          </Card>
        )}
      </div>
    </div>
  );
}