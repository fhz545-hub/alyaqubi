import { useEffect, useState } from "react";
import AppLayout from "@/components/AppLayout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAuth } from "@/contexts/AuthContext";
import { Navigate } from "react-router-dom";
import { GraduationCap, Plus, Trash2, Save, Info } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import {
  loadDistanceLearningSections,
  saveDistanceLearningSections,
  DistanceSection,
} from "@/utils/distanceLearningSections";
import { loadStudents, getGradesFromDB, getSectionsFromDB } from "@/store/studentsStore";
import { logAudit } from "@/utils/auditLog";
import { setDynamicDistanceSections } from "@/utils/distanceLearning";

const DistanceLearningSettingsPage = () => {
  const { profile } = useAuth();
  const [items, setItems] = useState<DistanceSection[]>([]);
  const [grades, setGrades] = useState<{ code: string; name: string }[]>([]);
  const [sectionsByGrade, setSectionsByGrade] = useState<Record<string, number[]>>({});
  const [pickGrade, setPickGrade] = useState("");
  const [pickSection, setPickSection] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!profile?.is_principal) return;
    let alive = true;
    (async () => {
      setLoading(true);
      await loadStudents();
      const gs = getGradesFromDB();
      const map: Record<string, number[]> = {};
      gs.forEach((g) => {
        map[g.code] = getSectionsFromDB(g.code);
      });
      const list = await loadDistanceLearningSections(true);
      if (alive) {
        setGrades(gs);
        setSectionsByGrade(map);
        setItems(list);
        setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [profile?.is_principal]);

  if (!profile) return null;
  if (!profile.is_principal) return <Navigate to="/" replace />;

  const handleAdd = () => {
    if (!pickGrade || !pickSection) {
      toast({ title: "يرجى اختيار المرحلة والشعبة", variant: "destructive" });
      return;
    }
    const gc = pickGrade;
    const sec = Number(pickSection);
    if (items.some((i) => i.gradeCode === gc && i.section === sec)) {
      toast({ title: "هذه الشعبة مضافة مسبقاً", variant: "destructive" });
      return;
    }
    setItems([...items, { gradeCode: gc, section: sec }]);
    setPickSection("");
  };

  const handleRemove = (gc: string, sec: number) => {
    setItems(items.filter((i) => !(i.gradeCode === gc && i.section === sec)));
  };

  const handleSave = async () => {
    setSaving(true);
    const ok = await saveDistanceLearningSections(items, profile.user_id);
    if (ok) {
      setDynamicDistanceSections(items);
      await logAudit(
        {
          action: "تحديث شعب التعليم الإلكتروني (الانتساب)",
          section: "إعدادات",
          entity_type: "school_settings",
          entity_id: "distance_learning_sections",
          details: { count: items.length, items },
        },
        { id: profile.user_id, name: profile.full_name, role: profile.role_title }
      );
      toast({ title: "تم الحفظ بنجاح", description: "ستُستثنى هذه الشعب من المؤشرات اليومية والمقارنات" });
    } else {
      toast({ title: "تعذر الحفظ", variant: "destructive" });
    }
    setSaving(false);
  };

  const gradeName = (code: string) => grades.find((g) => g.code === code)?.name || code;

  return (
    <AppLayout>
      <div className="max-w-3xl mx-auto">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-12 h-12 rounded-xl bg-primary/10 text-primary flex items-center justify-center">
            <GraduationCap size={22} />
          </div>
          <div>
            <h1 className="text-xl font-bold text-foreground">شعب التعليم الإلكتروني (الانتساب)</h1>
            <p className="text-sm text-muted-foreground">حدد الشعب التي لا تُحتسب في المواظبة اليومية والمؤشرات العامة</p>
          </div>
        </div>

        <Card className="p-4 mb-4 bg-info/5 border-info/30">
          <div className="flex gap-2 text-sm text-foreground">
            <Info size={18} className="text-info shrink-0 mt-0.5" />
            <p>
              الشعب المحددة هنا تُعتبر <strong>تعليم إلكتروني / انتساب</strong> ولن تظهر ضمن مؤشرات
              الحضور والغياب والسلوك اليومية، ولن تدخل في مقارنات الفصول المتميزة.
            </p>
          </div>
        </Card>

        {loading ? (
          <Card className="p-8 text-center text-muted-foreground text-sm">جارٍ التحميل...</Card>
        ) : (
          <>
            <Card className="p-4 mb-4">
              <h2 className="text-sm font-bold text-foreground mb-3">إضافة شعبة</h2>
              <div className="flex gap-2 flex-wrap">
                <Select value={pickGrade} onValueChange={(v) => { setPickGrade(v); setPickSection(""); }}>
                  <SelectTrigger className="flex-1 min-w-[180px]">
                    <SelectValue placeholder="اختر المرحلة" />
                  </SelectTrigger>
                  <SelectContent>
                    {grades.map((g) => (
                      <SelectItem key={g.code} value={g.code}>{g.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={pickSection} onValueChange={setPickSection} disabled={!pickGrade}>
                  <SelectTrigger className="flex-1 min-w-[140px]">
                    <SelectValue placeholder="اختر الشعبة" />
                  </SelectTrigger>
                  <SelectContent>
                    {(sectionsByGrade[pickGrade] || []).map((s) => (
                      <SelectItem key={s} value={String(s)}>شعبة {s}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button onClick={handleAdd} disabled={!pickGrade || !pickSection}>
                  <Plus size={16} className="ml-1" />
                  إضافة
                </Button>
              </div>
            </Card>

            <Card className="p-4 mb-4">
              <h2 className="text-sm font-bold text-foreground mb-3">
                الشعب المحددة ({items.length})
              </h2>
              {items.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-6">
                  لم يتم تحديد أي شعب بعد. جميع الشعب تُحتسب في المواظبة اليومية.
                </p>
              ) : (
                <div className="space-y-2">
                  {items.map((it) => (
                    <div
                      key={`${it.gradeCode}-${it.section}`}
                      className="flex items-center justify-between bg-muted/40 rounded-lg p-3"
                    >
                      <div className="flex items-center gap-2">
                        <Badge variant="secondary">{gradeName(it.gradeCode)}</Badge>
                        <span className="text-sm font-semibold">شعبة {it.section}</span>
                      </div>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => handleRemove(it.gradeCode, it.section)}
                        className="text-destructive hover:text-destructive"
                      >
                        <Trash2 size={14} />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </Card>

            <div className="flex justify-end">
              <Button onClick={handleSave} disabled={saving} size="lg">
                <Save size={16} className="ml-1" />
                {saving ? "جارٍ الحفظ..." : "حفظ التغييرات"}
              </Button>
            </div>
          </>
        )}
      </div>
    </AppLayout>
  );
};

export default DistanceLearningSettingsPage;