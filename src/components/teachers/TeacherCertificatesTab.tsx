import { useEffect, useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
} from "@/components/ui/select";
import { Award, Search, Download, Loader2, FileCheck2 } from "lucide-react";
import { listTeachers, type Teacher } from "@/utils/teachersApi";
import {
  openCertificateWindow,
  PRESET_REASONS,
  TEMPLATE_OPTIONS,
  type CertificateTemplate,
} from "@/utils/teacherCertificate";
import {
  downloadCertificatePdf,
} from "@/utils/teacherCertificatePdf";
import { getFullHijriDate } from "@/utils/hijri";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { hasPermission } from "@/store/permissionsStore";

const PRINCIPAL = "أ. فهد حامد الزهراني";
const VICE = "أ. سعود فهد الرويجح";
const SCHOOL = "مدرسة اليعقوبي الثانوية";

function gregToday() {
  const d = new Date();
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  return `${dd} / ${mm} / ${d.getFullYear()} م`;
}

export default function TeacherCertificatesTab() {
  const { profile } = useAuth();
  const [list, setList] = useState<Teacher[]>([]);
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string>("");
  const [reason, setReason] = useState(PRESET_REASONS[0]);
  const [template, setTemplate] = useState<CertificateTemplate>("royal-gold");
  const [hijri, setHijri] = useState("");
  const [greg, setGreg] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    setHijri(getFullHijriDate());
    setGreg(gregToday());
    (async () => {
      try {
        setList(await listTeachers());
      } catch (err: any) {
        toast.error("تعذّر تحميل قائمة المعلمين: " + err.message);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim();
    if (!q) return list;
    return list.filter((t) => t.full_name.includes(q) || (t.specialization || "").includes(q));
  }, [list, search]);

  const selected = useMemo(() => list.find((t) => t.id === selectedId) || null, [list, selectedId]);
  const isPrincipal = profile?.is_principal === true;
  const canPrintCertificates = hasPermission(profile?.user_id || "", isPrincipal, "print_teacher_certificates");

  const handleGenerate = () => {
    if (!canPrintCertificates) {
      toast.error("توليد وطباعة الشهادات يتطلب صلاحية من مدير المدرسة");
      return;
    }
    if (!selected) {
      toast.error("اختر المعلم أولاً");
      return;
    }
    openCertificateWindow({
      teacherName: selected.full_name,
      specialization: selected.specialization,
      reason,
      hijriDate: hijri,
      gregDate: greg,
      principalName: PRINCIPAL,
      viceName: VICE,
      schoolName: SCHOOL,
      template,
    });
  };

  const handleSavePdf = async () => {
    if (!canPrintCertificates) {
      toast.error("حفظ PDF يتطلب صلاحية طباعة وتصدير شهادات المعلمين");
      return;
    }
    if (!selected) {
      toast.error("اختر المعلم أولاً");
      return;
    }
    setSending(true);
    const id = toast.loading("جارٍ تجهيز ملف PDF...");
    try {
      await downloadCertificatePdf({
        teacherName: selected.full_name,
        specialization: selected.specialization,
        reason,
        hijriDate: hijri,
        gregDate: greg,
        principalName: PRINCIPAL,
        viceName: VICE,
        schoolName: SCHOOL,
        template,
      });
      toast.success("تم حفظ ملف PDF", { id });
    } catch (err: any) {
      console.error("save pdf error", err);
      toast.error(err?.message || "تعذّر حفظ الملف", { id });
    } finally {
      setSending(false);
    }
  };

  return (
    <div dir="rtl" className="space-y-4">
      <Card className="p-5 bg-gradient-to-l from-amber-50 to-yellow-50 border-amber-200">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-xl bg-amber-500 text-white grid place-items-center">
            <Award className="w-6 h-6" />
          </div>
          <div>
            <h3 className="text-lg font-black text-amber-900">شهادات شكر وتقدير للمعلمين المتميزين</h3>
            <p className="text-sm text-amber-800">صياغة تربوية أنيقة، تذيّل بأسماء مدير المدرسة ووكيل الشؤون التعليمية، وتُولَّد بصيغة PDF بنفس التصميم المعتمد لطباعتها أو حفظها.</p>
          </div>
        </div>
      </Card>

      <div className="grid lg:grid-cols-2 gap-4">
        {/* Left: Teacher picker */}
        <Card className="p-4">
          <div className="flex items-center gap-2 mb-3">
            <Search className="w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="ابحث عن المعلم بالاسم أو التخصص..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div className="border rounded-lg max-h-[420px] overflow-auto divide-y">
            {loading && <div className="p-4 text-center text-sm text-muted-foreground">جارٍ التحميل...</div>}
            {!loading && filtered.length === 0 && (
              <div className="p-4 text-center text-sm text-muted-foreground">لا يوجد معلمون مطابقون</div>
            )}
            {filtered.map((t) => {
              return (
                <div
                  key={t.id}
                  className={`flex items-center gap-2 p-3 hover:bg-amber-50 transition-colors ${
                    selectedId === t.id ? "bg-amber-100 border-r-4 border-amber-500" : ""
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => setSelectedId(t.id)}
                    className="flex-1 text-right"
                  >
                    <div className="font-bold text-foreground">{t.full_name}</div>
                    <div className="text-xs text-muted-foreground mt-0.5">
                      {t.specialization || "—"} {t.civil_id ? `• ${t.civil_id}` : ""}
                    </div>
                  </button>
                </div>
              );
            })}
          </div>
        </Card>

        {/* Right: Form */}
        <Card className="p-4 space-y-3">
          <div>
            <Label className="text-xs">تصميم الشهادة</Label>
            <Select value={template} onValueChange={(v: any) => setTemplate(v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {TEMPLATE_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">العبارة التربوية</Label>
            <Select value={reason} onValueChange={setReason}>
              <SelectTrigger><SelectValue placeholder="اختر صياغة جاهزة" /></SelectTrigger>
              <SelectContent>
                {PRESET_REASONS.map((r, i) => (
                  <SelectItem key={i} value={r} className="text-xs">{r.slice(0, 60)}...</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={4}
              className="mt-2 text-sm"
              placeholder="عدّل العبارة كما تشاء..."
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">التاريخ الهجري</Label>
              <Input value={hijri} onChange={(e) => setHijri(e.target.value)} />
            </div>
            <div>
              <Label className="text-xs">التاريخ الميلادي</Label>
              <Input value={greg} onChange={(e) => setGreg(e.target.value)} dir="ltr" />
            </div>
          </div>

          <div className="rounded-lg bg-muted/40 p-3 text-xs text-muted-foreground space-y-1">
            <div>• مدير المدرسة: <strong className="text-foreground">{PRINCIPAL}</strong></div>
            <div>• وكيل الشؤون التعليمية: <strong className="text-foreground">{VICE}</strong></div>
            <div>• المدرسة: <strong className="text-foreground">{SCHOOL}</strong></div>
          </div>

          <div className="flex flex-wrap gap-2 pt-2">
            <Button onClick={handleGenerate} disabled={!selected || sending} className="gap-2 bg-amber-600 hover:bg-amber-700">
              <FileCheck2 className="w-4 h-4" /> توليد الشهادة
            </Button>
            <Button onClick={handleSavePdf} disabled={!selected || sending} variant="outline" className="gap-2">
              {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
              حفظ بصيغة PDF
            </Button>
          </div>
          <div className="text-[11px] text-muted-foreground leading-relaxed bg-muted/30 rounded-md p-2">
            💡 يتم توليد الشهادة بنفس التصميم المعتمد بصيغة PDF عالية الجودة. يمكنك بعد الحفظ إرفاقها يدوياً في أي قناة تواصل (واتساب/بريد).
          </div>
          {selected && (
            <div className="text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-md p-2">
              ✓ سيتم حفظ الملف باسم: <strong>شهادة شكر وتقدير - {selected.full_name}.pdf</strong>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}