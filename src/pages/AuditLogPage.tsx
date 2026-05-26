import { useEffect, useState } from "react";
import AppLayout from "@/components/AppLayout";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { fetchAuditLog, AuditRow } from "@/utils/auditLog";
import { useAuth } from "@/contexts/AuthContext";
import { Navigate } from "react-router-dom";
import { Shield, Search, Calendar, User } from "lucide-react";

const AuditLogPage = () => {
  const { profile } = useAuth();
  const [rows, setRows] = useState<AuditRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  useEffect(() => {
    if (!profile?.is_principal) return;
    let alive = true;
    (async () => {
      setLoading(true);
      const data = await fetchAuditLog(500);
      if (alive) {
        setRows(data);
        setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [profile?.is_principal]);

  if (!profile) return null;
  if (!profile.is_principal) return <Navigate to="/" replace />;

  const filtered = rows.filter((r) => {
    if (!search.trim()) return true;
    const q = search.trim().toLowerCase();
    return (
      r.actor_name.toLowerCase().includes(q) ||
      r.action.toLowerCase().includes(q) ||
      r.section.toLowerCase().includes(q) ||
      r.entity_type.toLowerCase().includes(q)
    );
  });

  return (
    <AppLayout>
      <div className="max-w-6xl mx-auto">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-12 h-12 rounded-xl bg-primary/10 text-primary flex items-center justify-center">
            <Shield size={22} />
          </div>
          <div>
            <h1 className="text-xl font-bold text-foreground">سجل التدقيق والأثر الإلكتروني</h1>
            <p className="text-sm text-muted-foreground">جميع العمليات الحساسة المسجلة في النظام</p>
          </div>
        </div>

        <Card className="p-4 mb-4">
          <div className="relative">
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={16} />
            <Input
              placeholder="بحث بالاسم أو نوع العملية أو القسم..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pr-10"
            />
          </div>
        </Card>

        <Card className="p-4">
          {loading ? (
            <div className="text-center py-12 text-muted-foreground text-sm">جارٍ تحميل السجل...</div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground text-sm">لا توجد سجلات مطابقة</div>
          ) : (
            <div className="space-y-2">
              {filtered.map((row) => (
                <div
                  key={row.id}
                  className="border border-border rounded-lg p-3 hover:bg-muted/30 transition-colors"
                >
                  <div className="flex items-start justify-between gap-2 flex-wrap">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        <Badge variant="secondary" className="text-xs">
                          {row.section || "—"}
                        </Badge>
                        <span className="text-sm font-semibold text-foreground">{row.action}</span>
                        {row.entity_type && (
                          <span className="text-xs text-muted-foreground">
                            ({row.entity_type})
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-3 text-xs text-muted-foreground flex-wrap">
                        <span className="inline-flex items-center gap-1">
                          <User size={12} />
                          {row.actor_name || "غير معروف"}
                          {row.actor_role && (
                            <span className="text-muted-foreground/70">— {row.actor_role}</span>
                          )}
                        </span>
                        <span className="inline-flex items-center gap-1">
                          <Calendar size={12} />
                          {new Date(row.created_at).toLocaleString("ar-SA", {
                            dateStyle: "medium",
                            timeStyle: "short",
                          })}
                        </span>
                      </div>
                      {Object.keys(row.details || {}).length > 0 && (
                        <pre className="mt-2 text-[11px] bg-muted/50 rounded p-2 overflow-x-auto text-muted-foreground">
                          {JSON.stringify(row.details, null, 2)}
                        </pre>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>
    </AppLayout>
  );
};

export default AuditLogPage;