import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { CalendarDays, Plus, Trash2, Save, Moon, Wand2 } from "lucide-react";
import { toast } from "sonner";
import { loadRamadanDates, saveRamadanDates, clearRamadanCache, suggestRamadanDatesForCurrentSeason } from "@/utils/ramadanShift";

/**
 * إدارة قائمة الأيام الرمضانية الخاصة (دوام 9:30 ص لمدة 5 ساعات).
 * المدير فقط من يعدّل عبر RLS لجدول school_settings.
 */
export default function RamadanShiftManager() {
  const [dates, setDates] = useState<string[]>([]);
  const [draft, setDraft] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      const set = await loadRamadanDates();
      setDates(Array.from(set).sort());
      setLoading(false);
    })();
  }, []);

  const addDate = () => {
    const d = (draft || "").trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) {
      toast.error("صيغة التاريخ يجب أن تكون YYYY-MM-DD");
      return;
    }
    if (dates.includes(d)) {
      toast.warning("التاريخ موجود مسبقاً");
      return;
    }
    setDates([...dates, d].sort());
    setDraft("");
  };

  const removeDate = (d: string) => {
    setDates(dates.filter((x) => x !== d));
  };

  const suggestSeason = () => {
    const suggested = suggestRamadanDatesForCurrentSeason();
    if (!suggested.length) {
      toast.info("لم يُعثر على أيام رمضانية ضمن نافذة 4 أشهر حول اليوم — يمكنك الإضافة يدوياً");
      return;
    }
    const merged = Array.from(new Set([...(dates || []), ...suggested])).sort();
    setDates(merged);
    toast.success(`تم اقتراح ${suggested.length} يومًا رمضانيًا (أيام عمل) للموسم الحالي. اضغط حفظ لاعتمادها.`);
  };

  const persist = async () => {
    setSaving(true);
    const ok = await saveRamadanDates(dates);
    setSaving(false);
    if (ok) {
      clearRamadanCache();
      await loadRamadanDates();
      toast.success("تم حفظ تواريخ رمضان الخاصة وتطبيقها على احتساب التأخر");
    } else {
      toast.error("تعذّر الحفظ — تحقق من الصلاحيات");
    }
  };

  return (
    <Card className="p-5 border-primary/20" dir="rtl">
      <div className="flex items-center gap-3 mb-4">
        <div className="w-11 h-11 rounded-xl bg-primary/10 text-primary grid place-items-center">
          <Moon className="w-5 h-5" />
        </div>
        <div className="flex-1">
          <h3 className="text-lg font-extrabold text-foreground">أيام رمضان الخاصة (دوام 9:30 ص)</h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            هذه الأيام يبدأ فيها الدوام 09:30 ص لمدة 5 ساعات. لا تُحتسب تأخرات قبل هذا الوقت في تلك الأيام.
          </p>
        </div>
        <Badge variant="secondary" className="text-sm">{dates.length} يوم</Badge>
      </div>

      <div className="flex flex-wrap gap-2 items-end mb-4">
        <div className="flex-1 min-w-[220px]">
          <label className="text-xs text-muted-foreground block mb-1">إضافة تاريخ ميلادي</label>
          <Input
            type="date"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            className="h-10"
          />
        </div>
        <Button onClick={addDate} variant="outline" className="gap-1 h-10">
          <Plus size={16} /> إضافة
        </Button>
        <Button onClick={suggestSeason} variant="secondary" className="gap-1 h-10" title="اقتراح أيام رمضان للموسم الحالي بناءً على التقويم الهجري">
          <Wand2 size={16} /> اقتراح أيام الموسم
        </Button>
        <Button onClick={persist} disabled={saving || loading} className="gap-1 h-10">
          <Save size={16} /> {saving ? "جارٍ الحفظ..." : "حفظ القائمة"}
        </Button>
      </div>

      <p className="text-[11px] text-muted-foreground mb-3 leading-relaxed bg-muted/40 px-3 py-2 rounded-lg">
        💡 منطق مرن: زر «اقتراح أيام الموسم» يقرأ التقويم الهجري (أم القرى) تلقائيًا ويختار أيام شهر رمضان من الأحد حتى الخميس فقط، فيصلح لكل سنة دراسية ولكل تغيّر في توقيت رمضان دون الحاجة لتعديل البرنامج.
      </p>

      {loading ? (
        <p className="text-sm text-muted-foreground text-center py-4">جارٍ التحميل...</p>
      ) : dates.length === 0 ? (
        <div className="text-center py-6 text-sm text-muted-foreground bg-muted/30 rounded-lg">
          لا توجد تواريخ مسجلة. أضف الأيام التي ينطبق عليها دوام رمضان (9:30 ص لمدة 5 ساعات).
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2">
          {dates.map((d) => (
            <div key={d} className="flex items-center justify-between gap-1 px-2.5 py-2 rounded-lg bg-primary/5 border border-primary/15">
              <span className="text-xs font-mono font-bold text-foreground flex items-center gap-1.5">
                <CalendarDays size={12} className="text-primary" />
                {d}
              </span>
              <button
                onClick={() => removeDate(d)}
                className="text-destructive/70 hover:text-destructive transition-colors"
                aria-label="حذف"
              >
                <Trash2 size={14} />
              </button>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}