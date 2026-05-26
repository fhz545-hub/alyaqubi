import { Link, useNavigate } from "react-router-dom";
import AppSidebar from "@/components/AppSidebar";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { GraduationCap, BookOpen, Award, ClipboardCheck, Trophy, Printer, FileSearch, ArrowRight } from "lucide-react";

const SECTIONS = [
  {
    title: "الفصول المتميزة",
    description: "ترشيح الشعب المتميزة أسبوعياً وشهرياً وفصلياً وفق مؤشرات حقيقية",
    icon: Trophy,
    path: "/positive-behavior",
    color: "bg-amber-500/10 text-amber-600",
  },
  {
    title: "الملاحظات الصفية",
    description: "متابعة الملاحظات السلوكية الصفية وتسلسل التصعيد التربوي",
    icon: BookOpen,
    path: "/classroom",
    color: "bg-blue-500/10 text-blue-600",
  },
  {
    title: "كشوف متابعة المواد",
    description: "كشوف الحضور وأعمال السنة وكشوف مبسطة جاهزة للطباعة",
    icon: Printer,
    path: "/print",
    color: "bg-emerald-500/10 text-emerald-600",
  },
  {
    title: "الإحالات والإجراءات",
    description: "متابعة إحالات الطلاب للوكيل والموجه الطلابي",
    icon: ClipboardCheck,
    path: "/referral-tracking",
    color: "bg-violet-500/10 text-violet-600",
  },
  {
    title: "التقرير اليومي والتراكمي",
    description: "إحصائيات يومية شاملة (مواظبة، سلوك، ملاحظات، استئذان)",
    icon: FileSearch,
    path: "/daily-report",
    color: "bg-sky-500/10 text-sky-600",
  },
  {
    title: "السلوك الإيجابي",
    description: "تكريم الطلاب والشعب الأقل في السلوكيات السلبية",
    icon: Award,
    path: "/positive-behavior",
    color: "bg-rose-500/10 text-rose-600",
  },
];

export default function EducationalAffairsPage() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-background">
      <AppSidebar />
      <main className="lg:mr-64 p-4 sm:p-6">
        <div className="max-w-7xl mx-auto">
          <div className="flex items-center justify-between gap-4 flex-wrap mb-6">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-xl bg-primary/10 text-primary flex items-center justify-center">
                <GraduationCap size={24} />
              </div>
              <div>
                <h1 className="text-2xl md:text-3xl font-bold text-foreground">الشؤون التعليمية</h1>
                <p className="text-sm text-muted-foreground">
                  مركز إدارة العملية التعليمية والمتابعة الصفية
                </p>
              </div>
            </div>
            <Button variant="outline" asChild>
              <Link to="/">
                <ArrowRight className="ml-2 h-4 w-4" />
                العودة للرئيسية
              </Link>
            </Button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {SECTIONS.map((s) => (
              <Card
                key={s.title}
                onClick={() => navigate(s.path)}
                className="p-5 cursor-pointer hover:shadow-md hover:border-primary/40 transition-all group"
              >
                <div className={`w-12 h-12 rounded-xl ${s.color} flex items-center justify-center mb-3 group-hover:scale-110 transition-transform`}>
                  <s.icon size={24} />
                </div>
                <h3 className="font-bold text-foreground mb-1">{s.title}</h3>
                <p className="text-xs text-muted-foreground leading-relaxed">{s.description}</p>
              </Card>
            ))}
          </div>
        </div>
      </main>
    </div>
  );
}