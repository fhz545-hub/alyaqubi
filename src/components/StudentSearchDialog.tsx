import { useState, useMemo, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { loadStudents, getStudentsFromDB } from "@/store/studentsStore";
import { Search, MessageCircle } from "lucide-react";
import { Student } from "@/types/school";

interface StudentSearchDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelectStudent?: (student: Student) => void;
}

const StudentSearchDialog = ({ open, onOpenChange, onSelectStudent }: StudentSearchDialogProps) => {
  const [query, setQuery] = useState("");
  const [allStudents, setAllStudents] = useState<Student[]>([]);
  const navigate = useNavigate();

  useEffect(() => {
    if (open) {
      loadStudents().then(setAllStudents);
    }
  }, [open]);

  useEffect(() => {
    if (!open) setQuery("");
  }, [open]);

  const results = useMemo(() => {
    if (!query.trim()) return [];
    const q = query.trim().toLowerCase();
    return allStudents
      .filter(
        (s) =>
          s.name.includes(q) ||
          s.studentNumber.includes(q) ||
          s.guardianPhone.includes(q)
      )
      .slice(0, 20);
  }, [query, allStudents]);

  const handleSelect = (student: Student) => {
    if (onSelectStudent) {
      onSelectStudent(student);
    } else {
      navigate(`/student/${student.id}`);
    }
    onOpenChange(false);
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "k") {
        e.preventDefault();
        onOpenChange(!open);
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [open, onOpenChange]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md p-0 gap-0 overflow-hidden">
        <div className="flex items-center border-b border-border px-4">
          <Search className="ml-2 h-4 w-4 shrink-0 text-muted-foreground" />
          <Input
            placeholder="ابحث باسم الطالب أو رقم الهوية أو الجوال..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="border-0 focus-visible:ring-0 h-12 text-sm"
            autoFocus
          />
          <kbd className="pointer-events-none inline-flex h-5 select-none items-center gap-1 rounded border bg-muted px-1.5 font-mono text-[10px] font-medium text-muted-foreground">
            Ctrl+K
          </kbd>
        </div>

        <div className="max-h-[350px] overflow-y-auto">
          {query.trim() === "" ? (
            <div className="text-center py-10 text-sm text-muted-foreground">
              ابدأ بكتابة اسم الطالب أو رقم الهوية
            </div>
          ) : results.length === 0 ? (
            <div className="text-center py-10 text-sm text-muted-foreground">
              لا توجد نتائج لـ "{query}"
            </div>
          ) : (
            results.map((student) => (
              <button
                key={student.id}
                onClick={() => handleSelect(student)}
                className="w-full flex items-center gap-3 px-4 py-3 hover:bg-muted/50 transition-colors text-right border-b border-border/30 last:border-0"
              >
                <div className="w-9 h-9 rounded-full bg-primary/10 text-primary flex items-center justify-center text-sm font-bold shrink-0">
                  {student.name.charAt(0)}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-foreground text-sm truncate">{student.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {student.grade} - فصل {student.section} | {student.studentNumber}
                  </p>
                </div>
                {student.guardianPhone && (
                  <MessageCircle size={16} className="text-success shrink-0" />
                )}
              </button>
            ))
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default StudentSearchDialog;
