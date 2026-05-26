import { useState, useEffect, useMemo } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Student, ActionType, ACTION_LABELS, VIOLATION_CATEGORIES } from "@/types/school";
import { prepareBulkMessages, openWhatsApp, BulkMessageItem, isValidSaudiPhone, SCHOOL_WHATSAPP_NUMBER } from "@/utils/whatsapp";
import { useAuth } from "@/contexts/AuthContext";
import { MessageCircle, Send, CheckCircle, Clock, AlertTriangle, Users, Phone, SkipForward, Copy } from "lucide-react";
import { toast } from "@/hooks/use-toast";

interface BulkWhatsAppDialogProps {
  students: Student[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const BulkWhatsAppDialog = ({ students, open, onOpenChange }: BulkWhatsAppDialogProps) => {
  const { profile } = useAuth();
  const [actionType, setActionType] = useState<ActionType>("late");
  const [violationDegree, setViolationDegree] = useState("1");
  const [violationCategory, setViolationCategory] = useState("");
  const [description, setDescription] = useState("");
  const [bulkItems, setBulkItems] = useState<BulkMessageItem[]>([]);
  const [currentIndex, setCurrentIndex] = useState(-1);
  const [sentCount, setSentCount] = useState(0);
  const [isSending, setIsSending] = useState(false);

  useEffect(() => {
    if (!open) {
      setCurrentIndex(-1);
      setSentCount(0);
      setIsSending(false);
      setDescription("");
    }
  }, [open]);

  const senderInfo = profile ? { name: profile.full_name, role: profile.role_title } : undefined;
  const validStudents = useMemo(() => students.filter((s) => isValidSaudiPhone(s.guardianPhone)), [students]);
  const invalidStudents = useMemo(() => students.filter((s) => !isValidSaudiPhone(s.guardianPhone)), [students]);

  const degreeCategories = actionType === "violation"
    ? VIOLATION_CATEGORIES[`degree${violationDegree}` as keyof typeof VIOLATION_CATEGORIES] || []
    : [];

  const handlePrepare = () => {
    const details = actionType === "violation"
      ? { violationCategory, violationDegree: Number(violationDegree), description }
      : { description };
    const items = prepareBulkMessages(validStudents, actionType, details, senderInfo);
    setBulkItems(items);
    setCurrentIndex(0);
    setSentCount(0);
    setIsSending(true);
  };

  const handleSendCurrent = () => {
    if (currentIndex < 0 || currentIndex >= bulkItems.length) return;
    const item = bulkItems[currentIndex];
    const sent = openWhatsApp(item.phone, item.message);

    if (!sent) {
      toast({ title: "تعذر فتح واتساب", description: `تعذر فتح الرابط للرقم ${item.phone}`, variant: "destructive" });
      return;
    }

    setSentCount((c) => c + 1);
    if (currentIndex + 1 < bulkItems.length) {
      setCurrentIndex(currentIndex + 1);
    } else {
      setCurrentIndex(-2);
    }
  };

  const handleSkip = () => {
    if (currentIndex + 1 < bulkItems.length) {
      setCurrentIndex(currentIndex + 1);
    } else {
      setCurrentIndex(-2);
    }
  };

  const handleCopyMessage = () => {
    if (currentIndex < 0 || currentIndex >= bulkItems.length) return;
    navigator.clipboard.writeText(bulkItems[currentIndex].message);
    toast({ title: "تم نسخ الرسالة" });
  };

  // ─── Setup phase ───
  if (!isSending) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base">
              <Users size={20} className="text-success" />
              إرسال واتساب جماعي
            </DialogTitle>
            <DialogDescription className="sr-only">نافذة إرسال جماعي عبر واتساب</DialogDescription>
          </DialogHeader>

          {/* School Number */}
          <div className="flex items-center gap-2 rounded-lg bg-success/5 border border-success/20 p-3">
            <Phone size={16} className="text-success shrink-0" />
            <div className="text-xs">
              <span className="text-muted-foreground">الإرسال من رقم المدرسة الرسمي: </span>
              <span className="font-bold text-foreground" dir="ltr">+{SCHOOL_WHATSAPP_NUMBER}</span>
            </div>
          </div>

          {validStudents.length === 0 ? (
            <div className="text-center py-6">
              <AlertTriangle size={32} className="mx-auto text-warning mb-2" />
              <p className="text-sm text-muted-foreground">لا يوجد طلاب بأرقام صالحة</p>
            </div>
          ) : (
            <>
              {/* Summary */}
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-lg border border-border/50 p-3 text-center">
                  <p className="text-2xl font-bold text-success">{validStudents.length}</p>
                  <p className="text-[10px] text-muted-foreground">رقم صالح للإرسال</p>
                </div>
                <div className="rounded-lg border border-border/50 p-3 text-center">
                  <p className="text-2xl font-bold text-destructive">{invalidStudents.length}</p>
                  <p className="text-[10px] text-muted-foreground">رقم غير صالح</p>
                </div>
              </div>

              {/* Action type */}
              <div className="space-y-2">
                <p className="text-xs font-bold text-foreground">نوع الإجراء</p>
                <div className="flex flex-wrap gap-1.5">
                  {(["late", "absent", "violation", "permission", "summon"] as ActionType[]).map((type) => (
                    <button
                      key={type}
                      onClick={() => setActionType(type)}
                      className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all border ${
                        actionType === type
                          ? "border-primary bg-primary/10 text-primary"
                          : "border-border text-muted-foreground hover:border-primary/30"
                      }`}
                    >
                      {ACTION_LABELS[type]}
                    </button>
                  ))}
                </div>
              </div>

              {actionType === "violation" && (
                <div className="space-y-2">
                  <Select value={violationDegree} onValueChange={setViolationDegree}>
                    <SelectTrigger className="h-9"><SelectValue placeholder="درجة المخالفة" /></SelectTrigger>
                    <SelectContent>
                      {[1,2,3,4,5].map(d => (
                        <SelectItem key={d} value={String(d)}>الدرجة {["الأولى","الثانية","الثالثة","الرابعة","الخامسة"][d-1]}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {degreeCategories.length > 0 && (
                    <Select value={violationCategory} onValueChange={setViolationCategory}>
                      <SelectTrigger className="h-9"><SelectValue placeholder="نوع المخالفة" /></SelectTrigger>
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
                className="h-14 text-xs"
              />

              <Button onClick={handlePrepare} className="w-full gap-2 bg-success hover:bg-success/90 text-white">
                <Send size={16} />
                بدء الإرسال ({validStudents.length} رسالة)
              </Button>

              <p className="text-[10px] text-muted-foreground text-center leading-relaxed">
                سيتم فتح واتساب لكل ولي أمر تلقائياً — اضغط "إرسال" في كل محادثة
              </p>
            </>
          )}
        </DialogContent>
      </Dialog>
    );
  }

  // ─── Sending phase ───
  const current = currentIndex >= 0 ? bulkItems[currentIndex] : null;
  const isCompleted = currentIndex === -2;
  const progress = bulkItems.length > 0 ? Math.round(((currentIndex >= 0 ? currentIndex : bulkItems.length) / bulkItems.length) * 100) : 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <MessageCircle size={20} className="text-success" />
            الإرسال الجماعي
          </DialogTitle>
          <DialogDescription className="sr-only">تقدم الإرسال الجماعي</DialogDescription>
        </DialogHeader>

        {/* Progress bar */}
        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground">التقدم</span>
            <span className="font-bold text-foreground">{sentCount} / {bulkItems.length} تم إرسالها</span>
          </div>
          <div className="w-full bg-muted rounded-full h-2.5">
            <div className="bg-success h-2.5 rounded-full transition-all duration-300" style={{ width: `${progress}%` }} />
          </div>
        </div>

        {isCompleted ? (
          <div className="text-center py-8">
            <CheckCircle size={48} className="mx-auto text-success mb-3" />
            <p className="font-bold text-lg text-foreground">تم الانتهاء!</p>
            <p className="text-sm text-muted-foreground mt-1">
              تم إرسال <span className="font-bold text-success">{sentCount}</span> رسالة من أصل {bulkItems.length}
            </p>
            <Button onClick={() => onOpenChange(false)} className="mt-4" variant="outline">إغلاق</Button>
          </div>
        ) : current ? (
          <div className="space-y-3">
            {/* Current student card */}
            <div className="rounded-xl border border-border bg-card p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-bold text-foreground">{current.student.name}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {current.student.grade} — فصل {current.student.section}
                  </p>
                </div>
                <div className="text-left">
                  <p className="text-xs text-muted-foreground">ولي الأمر</p>
                  <p className="text-sm font-mono font-bold text-foreground" dir="ltr">+{current.phone}</p>
                </div>
              </div>
              <div className="flex items-center gap-1 mt-2">
                <Clock size={12} className="text-primary" />
                <span className="text-[11px] text-primary font-medium">
                  الرسالة {currentIndex + 1} من {bulkItems.length}
                </span>
              </div>
            </div>

            {/* Message preview */}
            <details className="group">
              <summary className="text-xs text-muted-foreground cursor-pointer hover:text-foreground flex items-center gap-1">
                <MessageCircle size={12} /> معاينة الرسالة
              </summary>
              <div className="mt-2 bg-muted/30 rounded-lg p-3 text-xs leading-relaxed whitespace-pre-wrap max-h-28 overflow-y-auto border border-border/30">
                {current.message}
              </div>
            </details>

            {/* Action buttons */}
            <div className="grid grid-cols-3 gap-2">
              <Button onClick={handleSendCurrent} className="col-span-2 bg-success hover:bg-success/90 text-white gap-2">
                <Send size={16} />
                إرسال واتساب
              </Button>
              <Button onClick={handleSkip} variant="outline" className="gap-1.5">
                <SkipForward size={14} />
                تخطي
              </Button>
            </div>
            <Button onClick={handleCopyMessage} variant="ghost" size="sm" className="w-full gap-1.5 text-xs text-muted-foreground">
              <Copy size={12} />
              نسخ نص الرسالة
            </Button>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
};

export default BulkWhatsAppDialog;
