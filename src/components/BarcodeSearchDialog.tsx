import { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { getStudentsFromDB } from "@/store/studentsStore";
import { getActions, addAction } from "@/store/actionsStore";
import { Student, ACTION_LABELS, ACTION_COLORS } from "@/types/school";
import { useAuth } from "@/contexts/AuthContext";
import { ScanBarcode, User, History, MessageCircle, CheckCircle, Clock, XCircle, AlertTriangle, Camera, CameraOff } from "lucide-react";
import WhatsAppActionDialog from "./WhatsAppActionDialog";
import { toast } from "@/hooks/use-toast";
import { playSuccessSound, playErrorSound, playDuplicateSound, playConflictSound } from "@/utils/scanSounds";
import CameraBarcodeScanner from "./CameraBarcodeScanner";
import { printThermalCard } from "@/utils/print";

interface BarcodeSearchDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  autoAction?: "late" | "absent" | null;
}

// Check if student already has this action type today
const getStudentTodayActions = (studentNumber: string): string[] => {
  const now = new Date();
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  const actions = getActions();
  return actions.filter(a => a.studentNumber === studentNumber && a.date === today).map(a => a.type);
};

const isDuplicateToday = (studentNumber: string, type: string): boolean => {
  return getStudentTodayActions(studentNumber).includes(type);
};

// Check if student is marked absent today (conflict with late)
const isAbsentToday = (studentNumber: string): boolean => {
  return getStudentTodayActions(studentNumber).includes("absent");
};

const BarcodeSearchDialog = ({ open, onOpenChange, autoAction }: BarcodeSearchDialogProps) => {
  const navigate = useNavigate();
  const { profile } = useAuth();
  const [barcode, setBarcode] = useState("");
  const [foundStudent, setFoundStudent] = useState<Student | null>(null);
  const [whatsappOpen, setWhatsappOpen] = useState(false);
  const [quickAction, setQuickAction] = useState<string>(autoAction || "");
  const [actionSaved, setActionSaved] = useState(false);
  const [duplicateWarning, setDuplicateWarning] = useState(false);
  const [conflictWarning, setConflictWarning] = useState(false);
  const [cameraActive, setCameraActive] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setBarcode("");
      setFoundStudent(null);
      setActionSaved(false);
      setDuplicateWarning(false);
      setConflictWarning(false);
      setQuickAction(autoAction || "");
      setCameraActive(false);
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [open, autoAction]);

  const processStudent = useCallback((student: Student, actionType?: string | null) => {
    setFoundStudent(student);
    setActionSaved(false);
    setDuplicateWarning(false);
    setConflictWarning(false);

    const type = actionType || autoAction;
    if (!type) return;

    // Check duplicate
    if (isDuplicateToday(student.studentNumber, type)) {
      setDuplicateWarning(true);
      playDuplicateSound();
      toast({ title: `⚠️ ${student.name} — مسجل مسبقاً اليوم (${ACTION_LABELS[type as keyof typeof ACTION_LABELS]})`, variant: "destructive", duration: 1500 });
      setTimeout(() => { resetForNextScan(); }, 800);
      return;
    }

    // Check conflict: trying to mark late when already absent
    if (type === "late" && isAbsentToday(student.studentNumber)) {
      setConflictWarning(true);
      playConflictSound();
      toast({ title: `🚫 ${student.name} — مسجل غائب اليوم! يجب إلغاء الغياب أولاً قبل تسجيل التأخر`, variant: "destructive", duration: 3000 });
      setTimeout(() => { resetForNextScan(); }, 1500);
      return;
    }

    // Check conflict: trying to mark absent when already late
    if (type === "absent" && getStudentTodayActions(student.studentNumber).includes("late")) {
      setConflictWarning(true);
      playConflictSound();
      toast({ title: `🚫 ${student.name} — مسجل متأخر اليوم! يجب إلغاء التأخر أولاً قبل تسجيل الغياب`, variant: "destructive", duration: 3000 });
      setTimeout(() => { resetForNextScan(); }, 1500);
      return;
    }

    saveAction(student, type);
  }, [autoAction, profile]);

  const resetForNextScan = useCallback(() => {
    setBarcode("");
    setFoundStudent(null);
    setActionSaved(false);
    setDuplicateWarning(false);
    setConflictWarning(false);
    inputRef.current?.focus();
  }, []);

  const handleSearch = useCallback((value: string) => {
    setBarcode(value);
    setActionSaved(false);
    setDuplicateWarning(false);
    setConflictWarning(false);
    const trimmed = value.trim();
    if (trimmed.length >= 4) {
      const student = getStudentsFromDB().find((s) => s.studentNumber === trimmed);
      if (!student) {
        setFoundStudent(null);
        if (trimmed.length >= 6) playErrorSound();
        return;
      }
      processStudent(student);
    } else {
      setFoundStudent(null);
    }
  }, [processStudent]);

  const handleCameraDetected = useCallback((code: string) => {
    const student = getStudentsFromDB().find((s) => s.studentNumber === code);
    if (!student) {
      playErrorSound();
      toast({ title: `❌ لا يوجد طالب بالرقم: ${code}`, variant: "destructive", duration: 1500 });
      return;
    }
    setBarcode(code);
    processStudent(student);
  }, [processStudent]);

  const saveAction = useCallback((student: Student, type: string) => {
    if (isDuplicateToday(student.studentNumber, type)) {
      setDuplicateWarning(true);
      playDuplicateSound();
      toast({ title: `⚠️ ${student.name} — مسجل مسبقاً اليوم`, variant: "destructive", duration: 1500 });
      return;
    }

    const now = new Date();
    const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
    const time = now.toTimeString().slice(0, 5);

    const descMap: Record<string, string> = {
      late: "تأخر صباحي - مسح باركود",
      absent: "غياب - مسح باركود",
      violation: "مخالفة - مسح باركود",
      permission: "استئذان - مسح باركود",
    };

    addAction(
      {
        studentId: student.id,
        studentName: student.name,
        studentNumber: student.studentNumber,
        grade: student.grade,
        section: student.section,
        type: type as any,
        date: today,
        time,
        description: descMap[type] || type,
        guardianPhone: student.guardianPhone,
      },
      profile?.full_name || "",
      profile?.role_title || ""
    );

    setActionSaved(true);
    playSuccessSound();
    toast({ title: `✅ ${ACTION_LABELS[type as keyof typeof ACTION_LABELS] || type} — ${student.name}`, duration: 1200 });

    // Auto-print late card if enabled
    if (type === "late" && localStorage.getItem("autoLateCardPrint") !== "false") {
      const actions = getActions().filter(a => a.studentId === student.id || a.studentNumber === student.studentNumber);
      const archive = {
        absences: actions.filter(a => a.type === "absent").length,
        lateCount: actions.filter(a => a.type === "late").length,
      };
      printThermalCard(student, "late", undefined, undefined, profile?.full_name, archive);
    }

    setTimeout(() => { resetForNextScan(); }, 500);
  }, [profile, resetForNextScan]);

  const handleQuickAction = useCallback(() => {
    if (foundStudent && quickAction) {
      processStudent(foundStudent, quickAction);
    }
  }, [foundStudent, quickAction, processStudent]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === "Enter" && barcode.trim()) {
      const student = getStudentsFromDB().find((s) => s.studentNumber === barcode.trim());
      if (!student) {
        setFoundStudent(null);
        playErrorSound();
        return;
      }
      processStudent(student);
    }
  }, [barcode, processStudent]);

  const studentActions = foundStudent
    ? getActions().filter((a) => a.studentNumber === foundStudent.studentNumber)
    : [];

  return (
    <>
      <Dialog open={open} onOpenChange={(v) => { if (!v) setCameraActive(false); onOpenChange(v); }}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ScanBarcode size={20} className="text-primary" />
              {autoAction === "late" ? "مسح باركود التأخر" : autoAction === "absent" ? "مسح باركود الغياب" : "البحث بالباركود"}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-3">
            {autoAction && (
              <div className={`text-center p-2.5 rounded-lg font-semibold text-sm ${autoAction === "late" ? "bg-warning/10 text-warning" : "bg-destructive/10 text-destructive"}`}>
                {autoAction === "late" ? <><Clock size={16} className="inline ml-1" /> وضع تسجيل التأخر — التسجيل تلقائي</> :
                  <><XCircle size={16} className="inline ml-1" /> وضع تسجيل الغياب — التسجيل تلقائي</>}
              </div>
            )}

            {/* Camera Scanner */}
            <CameraBarcodeScanner
              active={cameraActive}
              onDetected={handleCameraDetected}
              onError={(err) => toast({ title: `❌ ${err}`, variant: "destructive" })}
            />

            {/* Input + Camera Toggle */}
            <div className="flex gap-2">
              <Input
                ref={inputRef}
                placeholder="امسح الباركود أو أدخل الرقم..."
                value={barcode}
                onChange={(e) => handleSearch(e.target.value)}
                onKeyDown={handleKeyDown}
                className="text-center text-lg font-mono tracking-wider flex-1"
                autoFocus
              />
              <Button
                variant={cameraActive ? "default" : "outline"}
                size="icon"
                className="shrink-0"
                onClick={() => setCameraActive(!cameraActive)}
                title={cameraActive ? "إيقاف الكاميرا" : "تشغيل الكاميرا"}
              >
                {cameraActive ? <CameraOff size={20} /> : <Camera size={20} />}
              </Button>
            </div>

            {barcode.trim().length >= 4 && !foundStudent && (
              <div className="text-center py-4 text-sm text-muted-foreground">
                لا يوجد طالب بهذا الرقم
              </div>
            )}

            {foundStudent && (
              <div className="space-y-3 animate-fade-in">
                {actionSaved && (
                  <div className="bg-success/10 text-success text-center p-2.5 rounded-lg font-semibold text-sm flex items-center justify-center gap-2">
                    <CheckCircle size={18} /> تم التسجيل بنجاح!
                  </div>
                )}
                {duplicateWarning && (
                  <div className="bg-destructive/10 text-destructive text-center p-2.5 rounded-lg font-semibold text-sm flex items-center justify-center gap-2">
                    <AlertTriangle size={18} /> مسجل مسبقاً اليوم — لا يمكن التكرار
                  </div>
                )}
                {conflictWarning && (
                  <div className="bg-destructive/10 text-destructive text-center p-2.5 rounded-lg font-semibold text-sm flex items-center justify-center gap-2">
                    <AlertTriangle size={18} /> تعارض! يجب إلغاء الإجراء السابق يدوياً أولاً
                  </div>
                )}

                {/* Student Info */}
                <div className="bg-muted/50 rounded-xl p-3 flex items-center gap-3">
                  <div className="w-11 h-11 rounded-full bg-primary/10 text-primary flex items-center justify-center text-lg font-bold shrink-0">
                    {foundStudent.name.charAt(0)}
                  </div>
                  <div className="min-w-0">
                    <h3 className="font-bold text-foreground truncate">{foundStudent.name}</h3>
                    <p className="text-sm text-muted-foreground">{foundStudent.grade} - فصل {foundStudent.section}</p>
                  </div>
                </div>

                {/* Quick Action (if not auto) */}
                {!autoAction && (
                  <div className="flex gap-2">
                    <Select value={quickAction} onValueChange={setQuickAction}>
                      <SelectTrigger className="flex-1">
                        <SelectValue placeholder="اختر الإجراء..." />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="late">تأخر</SelectItem>
                        <SelectItem value="absent">غياب</SelectItem>
                        <SelectItem value="violation">مخالفة</SelectItem>
                        <SelectItem value="permission">استئذان</SelectItem>
                      </SelectContent>
                    </Select>
                    <Button onClick={handleQuickAction} disabled={!quickAction} className="gap-1">
                      <CheckCircle size={16} /> تسجيل
                    </Button>
                  </div>
                )}

                {/* Quick Actions */}
                <div className="flex gap-2">
                  <Button variant="outline" className="flex-1 gap-2" onClick={() => navigate(`/student/${foundStudent.id}`)}>
                    <User size={16} /> ملف الطالب
                  </Button>
                  <Button className="flex-1 gap-2 bg-success hover:bg-success/90 text-success-foreground" onClick={() => setWhatsappOpen(true)}>
                    <MessageCircle size={16} /> واتساب
                  </Button>
                </div>

                {/* Action History */}
                {studentActions.length > 0 && (
                  <div>
                    <h4 className="text-sm font-semibold text-foreground mb-1.5 flex items-center gap-2">
                      <History size={14} /> سجل الإجراءات ({studentActions.length})
                    </h4>
                    <div className="space-y-1 max-h-32 overflow-y-auto">
                      {studentActions.slice(0, 8).map((action) => (
                        <div key={action.id} className="flex items-center justify-between py-1.5 px-2.5 rounded-lg bg-background text-sm">
                          <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${ACTION_COLORS[action.type]}`}>
                            {ACTION_LABELS[action.type]}
                          </span>
                          <span className="text-xs text-muted-foreground">{action.date} {action.time}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {foundStudent && (
        <WhatsAppActionDialog student={foundStudent} open={whatsappOpen} onOpenChange={setWhatsappOpen} />
      )}
    </>
  );
};

export default BarcodeSearchDialog;
