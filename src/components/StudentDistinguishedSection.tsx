import React, { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { DistinguishedRecord } from "@/utils/distinguishedBehavior";
import { TrendingUp, Calendar, User, Paperclip, Sparkles } from "lucide-react";

interface Props {
  studentId: string;
  studentNumber: string;
}

export const StudentDistinguishedSection: React.FC<Props> = ({ studentId, studentNumber }) => {
  const [records, setRecords] = useState<DistinguishedRecord[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("distinguished_behavior_records")
      .select("*")
      .or(`student_id.eq.${studentId},student_number.eq.${studentNumber}`)
      .order("execution_date", { ascending: false });
    if (!error) setRecords((data || []) as DistinguishedRecord[]);
    setLoading(false);
  };

  useEffect(() => {
    load();
    const channel = supabase
      .channel(`student-distinguished-${studentId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "distinguished_behavior_records" }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [studentId, studentNumber]);

  if (loading) return null;
  if (records.length === 0) return null;

  const total = records.reduce((s, r) => s + (r.points || 0), 0);

  return (
    <div className="bg-card rounded-xl border border-success/30 mb-6 overflow-hidden">
      <div className="px-5 py-3 bg-success/5 border-b border-success/20 flex items-center justify-between">
        <h3 className="font-bold text-foreground text-sm flex items-center gap-2">
          <TrendingUp size={18} className="text-success" />
          سجل التحسن السلوكي ({records.length})
        </h3>
        <span className="text-xs font-bold bg-success/15 text-success px-3 py-1 rounded-full border border-success/30">
          مجموع الدرجات: {total}
        </span>
      </div>
      <div className="p-4 space-y-3 max-h-[400px] overflow-y-auto">
        {records.map((r) => (
          <div key={r.id} className="rounded-lg border border-border/40 bg-muted/20 p-3">
            <div className="flex items-center gap-2 mb-1 flex-wrap">
              <span className="text-[10px] bg-primary/10 text-primary px-2 py-0.5 rounded-full font-bold">بند {r.item_number}</span>
              <span className="text-[10px] bg-warning/10 text-warning px-2 py-0.5 rounded-full font-bold">+{r.points} درجة</span>
              <span className="text-[10px] text-muted-foreground"><Calendar size={10} className="inline ml-1" />{r.execution_date}</span>
            </div>
            <p className="text-xs font-semibold text-foreground flex items-center gap-1"><Sparkles size={11} className="text-warning" />{r.item_label}</p>
            <p className="text-xs text-muted-foreground mt-1 leading-relaxed">{r.description}</p>
            {(r.evidence_url || r.evidence_note) && (
              <div className="mt-2 p-2 rounded-md bg-warning/5 border border-warning/20">
                <div className="text-[10px] font-bold text-warning mb-1 flex items-center gap-1"><Paperclip size={10} /> الشواهد</div>
                {r.evidence_url && <a href={r.evidence_url} target="_blank" rel="noreferrer" className="text-[11px] text-primary hover:underline break-all block">{r.evidence_url}</a>}
                {r.evidence_note && <p className="text-[11px] text-muted-foreground mt-1">{r.evidence_note}</p>}
              </div>
            )}
            <p className="text-[10px] text-muted-foreground mt-2"><User size={10} className="inline ml-1" />راصد السلوك: {r.recorded_by_name} ({r.recorded_by_role})</p>
          </div>
        ))}
      </div>
    </div>
  );
};

export default StudentDistinguishedSection;
