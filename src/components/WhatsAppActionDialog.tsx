import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Student, ActionType, ACTION_LABELS, VIOLATION_CATEGORIES } from "@/types/school";
import { generateWhatsAppMessage, isValidSaudiPhone, openWhatsApp } from "@/utils/whatsapp";
import { addAction } from "@/store/actionsStore";
import { printThermalCard, printOfficialDocument } from "@/utils/print";
import { useAuth } from "@/contexts/AuthContext";
import { MessageCircle, Clock, XCircle, AlertTriangle, LogOut, DoorOpen, DoorClosed, UserCheck, Printer } from "lucide-react";
import { toast } from "@/hooks/use-toast";

interface WhatsAppActionDialogProps {
  student: Student;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialActionType?: ActionType;
  initialViolationDegree?: string;
  initialViolationCategory?: string;
}

const actionIcons: Partial<Record<ActionType, React.ReactNode>> = {
  late: <Clock size={18} />,
  absent: <XCircle size={18} />,
  violation: <AlertTriangle size={18} />,
  permission: <LogOut size={18} />,
  entry: <DoorOpen size={18} />,
  exit: <DoorClosed size={18} />,
  summon: <UserCheck size={18} />,
};

const printableActions: ActionType[] = ["late", "violation", "entry", "exit", "permission"];
const summonActions: ActionType[] = ["summon", "violation"];

const WhatsAppActionDialog = ({
  student,
  open,
  onOpenChange,
  initialActionType = "late",
  initialViolationDegree = "1",
  initialViolationCategory = "",
}: WhatsAppActionDialogProps) => {
  const { profile } = useAuth();
  const [actionType, setActionType] = useState<ActionType>(initialActionType);
  const [violationDegree, setViolationDegree] = useState<string>(initialViolationDegree);
  const [violationCategory, setViolationCategory] = useState(initialViolationCategory);
  const [description, setDescription] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (!open) return;
    setActionType(initialActionType);
    setViolationDegree(initialViolationDegree);
    setViolationCategory(initialViolationCategory);
    setDescription("");
  }, [open, initialActionType, initialViolationDegree, initialViolationCategory]);

  const senderInfo = profile ? { name: profile.full_name, role: profile.role_title } : undefined;

  const recordAction = async () => {
    try {
      const now = new Date();
      await addAction(
        {
          studentId: student.id,
          studentName: student.name,
          studentNumber: student.studentNumber,
          grade: student.grade,
          section: student.section,
          type: actionType,
          date: now.toISOString().split("T")[0],
          time: now.toTimeString().slice(0, 5),
          description: description || ACTION_LABELS[actionType],
          violationDegree: actionType === "violation" ? (Number(violationDegree) as 1 | 2 | 3 | 4 | 5) : undefined,
          violationCategory: actionType === "violation" ? violationCategory : undefined,
          guardianPhone: student.guardianPhone,
          messageSent: false,
        },
        profile?.full_name,
        profile?.role_title
      );
      return true;
    } catch (error) {
      console.error("Failed to record action:", error);
      toast({ title: "تعذر حفظ الإجراء", variant: "destructive" });
      return false;
    }
  };

  const handleSend = async () => {
    if (isSubmitting) return;

    if (!isValidSaudiPhone(student.guardianPhone)) {
      toast({
        title: "رقم جوال ولي الأمر غير صالح",
        description: "استخدم رقمًا بصيغة سعودية صحيحة مثل 05XXXXXXXX أو 9665XXXXXXXX",
        variant: "destructive",
      });
      return;
    }

    const details = actionType === "violation"
      ? { violationCategory, violationDegree: Number(violationDegree), description }
      : { description };

    const message = generateWhatsAppMessage(student, actionType, details, senderInfo);

    setIsSubmitting(true);

    try {
      const sent = openWhatsApp(student.guardianPhone, message);
      if (!sent) {
        toast({
          title: "تعذر فتح واتساب",
          description: "تحقق من رقم الجوال أو اسمح بفتح الروابط الخارجية من المتصفح",
          variant: "destructive",
        });
        return;
      }

      const ok = await recordAction();
      if (ok) {
        toast({ title: "تم إرسال واتساب وحفظ الإجراء" });
        onOpenChange(false);
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handlePrintCard = async () => {
    if (isSubmitting || !printableActions.includes(actionType)) return;
    setIsSubmitting(true);
    try {
      const ok = await recordAction();
      if (!ok) return;
      printThermalCard(student, actionType as any, description || violationCategory);
      toast({ title: "تم طباعة الكرت وحفظ الإجراء" });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handlePrintOfficial = async () => {
    if (isSubmitting) return;
    setIsSubmitting(true);
    try {
      const ok = await recordAction();
      if (!ok) return;
      const docType = actionType === "summon" ? "summon" : actionType === "violation" ? "violation" : "general";
      printOfficialDocument(student, docType, description || violationCategory);
      toast({ title: "تم طباعة الخطاب الرسمي وحفظ الإجراء" });
    } finally {
      setIsSubmitting(false);
    }
  };

  const degreeCategories =
    actionType === "violation"
      ? VIOLATION_CATEGORIES[`degree${violationDegree}` as keyof typeof VIOLATION_CATEGORIES] || []
      : [];

  const previewMessage = generateWhatsAppMessage(student, actionType, {
    violationCategory,
    violationDegree: Number(violationDegree),
    description,
  }, senderInfo);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <MessageCircle size={20} className="text-success" />
            إجراء على الطالب
          </DialogTitle>
          <DialogDescription className="sr-only">نافذة تنفيذ إجراء على الطالب</DialogDescription>
        </DialogHeader>

        <div className="bg-muted/50 rounded-lg p-3 text-sm space-y-1">
          <p className="font-semibold text-foreground">{student.name}</p>
          <p className="text-muted-foreground">
            {student.grade} - فصل {student.section} | {student.studentNumber}
          </p>
          {profile && (
            <p className="text-xs text-primary">المنفذ: {profile.role_title} {profile.full_name}</p>
          )}
        </div>

        <div className="grid grid-cols-4 gap-2">
          {(["late", "absent", "violation", "permission", "summon", "entry", "exit"] as ActionType[]).map((type) => (
            <button
              key={type}
              onClick={() => setActionType(type)}
              className={`flex flex-col items-center gap-1 p-2.5 rounded-lg border text-xs font-medium transition-all ${
                actionType === type
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-border hover:border-primary/30 text-muted-foreground hover:text-foreground"
              }`}
            >
              {actionIcons[type]}
              <span>{ACTION_LABELS[type]}</span>
            </button>
          ))}
        </div>

        {actionType === "violation" && (
          <div className="space-y-3">
            <Select value={violationDegree} onValueChange={setViolationDegree}>
              <SelectTrigger><SelectValue placeholder="درجة المخالفة" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="1">الدرجة الأولى (1 درجة)</SelectItem>
                <SelectItem value="2">الدرجة الثانية (3 درجات)</SelectItem>
                <SelectItem value="3">الدرجة الثالثة (10 درجات)</SelectItem>
                <SelectItem value="4">الدرجة الرابعة (15 درجة)</SelectItem>
              </SelectContent>
            </Select>
            {degreeCategories.length > 0 && (
              <Select value={violationCategory} onValueChange={setViolationCategory}>
                <SelectTrigger><SelectValue placeholder="نوع المخالفة" /></SelectTrigger>
                <SelectContent>
                  {degreeCategories.map((cat) => (
                    <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>
        )}

        <Textarea
          placeholder="ملاحظات إضافية (اختياري)..."
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          className="h-20"
        />

        <details className="group">
          <summary className="text-sm text-muted-foreground cursor-pointer hover:text-foreground">معاينة رسالة واتساب</summary>
          <div className="mt-2 bg-muted/30 rounded-lg p-3 text-xs text-foreground leading-relaxed whitespace-pre-wrap max-h-48 overflow-y-auto">
            {previewMessage}
          </div>
        </details>

        <div className="flex flex-col gap-2">
          <Button
            onClick={handleSend}
            className="w-full bg-success hover:bg-success/90 text-success-foreground gap-2"
            disabled={!isValidSaudiPhone(student.guardianPhone) || isSubmitting}
          >
            <MessageCircle size={18} />
            إرسال واتساب
          </Button>

          <div className="flex gap-2">
            {printableActions.includes(actionType) && (
              <Button variant="outline" className="flex-1 gap-2" onClick={handlePrintCard} disabled={isSubmitting}>
                <Printer size={16} />
                طباعة كرت حراري
              </Button>
            )}
            {summonActions.includes(actionType) && (
              <Button variant="outline" className="flex-1 gap-2" onClick={handlePrintOfficial} disabled={isSubmitting}>
                <Printer size={16} />
                طباعة خطاب رسمي A4
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default WhatsAppActionDialog;
