import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Maximize2, RefreshCw } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { hasPermission } from "@/store/permissionsStore";
import { sendSmsToGuardian } from "@/utils/sms";

interface Props {
  src: string;
  source: "monthly_attendance" | "admin_affairs";
  title: string;
}

export default function LegacyEmbed({ src, source, title }: Props) {
  const ref = useRef<HTMLIFrameElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const { profile } = useAuth();
  const isPrincipal = profile?.is_principal === true;
  const canImport =
    isPrincipal || hasPermission(profile?.user_id || "", isPrincipal, "manage_teacher_affairs");

  async function archive(payload: any) {
    try {
      const { data: u } = await supabase.auth.getUser();
      const userId = u?.user?.id ?? null;
      let actorName = "";
      if (userId) {
        const { data: p } = await supabase
          .from("profiles")
          .select("full_name")
          .eq("user_id", userId)
          .maybeSingle();
        actorName = p?.full_name ?? "";
      }
      const row = {
        source,
        report_type: String(payload?.report_type ?? title ?? ""),
        action_type: String(payload?.action_type ?? ""),
        teacher_name: String(payload?.teacher_name ?? ""),
        teacher_civil_id: String(payload?.teacher_civil_id ?? ""),
        teacher_phone: String(payload?.teacher_phone ?? ""),
        greg_date: String(payload?.greg_date ?? new Date().toISOString().slice(0, 10)),
        hijri_date: String(payload?.hijri_date ?? ""),
        month_label: String(payload?.month_label ?? ""),
        summary: String(payload?.summary ?? ""),
        payload: payload ?? {},
        created_by: userId,
        created_by_name: actorName,
      };
      const { error } = await supabase.from("teacher_legacy_archive").insert(row);
      if (error) {
        console.warn("archive insert failed", error);
      }
    } catch (e) {
      console.warn(e);
    }
  }

  useEffect(() => {
    function onMsg(ev: MessageEvent) {
      const data: any = ev.data;
      if (!data || data.__lovable !== true) return;
      if (data.source !== source) return;
      if (data.type === "ready") {
        // أبلِغ الإطار بصلاحية المستخدم (لإخفاء الحذف عن غير المدير)
        try {
          ref.current?.contentWindow?.postMessage(
            { __lovable: true, type: "auth", source, isPrincipal, canImport },
            "*",
          );
        } catch {}
        return;
      }
      if (data.type === "archive") {
        archive(data.payload);
        return;
      }
      if (data.type === "request_haduri_for_date") {
        const date = String(data.greg_date || "").trim();
        if (!date) {
          ref.current?.contentWindow?.postMessage(
            { __lovable: true, type: "haduri_for_date", source, greg_date: date, rows: [] },
            "*",
          );
          return;
        }
        (async () => {
          try {
            const { data: rows, error } = await supabase
              .from("haduri_daily_records")
              .select("teacher_civil_id,teacher_name,teacher_phone,specialization,greg_date,in_time,out_time,work_min,late_min,excuse_min,status,source_file,month_label,month_key")
              .eq("greg_date", date);
            if (error) throw error;
            ref.current?.contentWindow?.postMessage(
              {
                __lovable: true,
                type: "haduri_for_date",
                source,
                greg_date: date,
                rows: rows || [],
              },
              "*",
            );
          } catch (err) {
            console.warn("haduri lookup failed", err);
            ref.current?.contentWindow?.postMessage(
              { __lovable: true, type: "haduri_for_date", source, greg_date: date, rows: [], error: String((err as any)?.message || err) },
              "*",
            );
          }
        })();
        return;
      }
      if (data.type === "send_sms") {
        const reqId = String(data.reqId || "");
        const phone = String(data.phone || "");
        const message = String(data.message || "");
        const teacherName = String(data.teacher_name || "");
        const teacherCivil = String(data.teacher_civil_id || "");
        (async () => {
          let result: { success: boolean; error?: string } = { success: false, error: "غير معروف" };
          if (!phone || !message) {
            result = { success: false, error: "رقم الجوال أو نص الرسالة مفقود" };
          } else {
            try {
              const r = await sendSmsToGuardian(phone, message);
              result = { success: !!r.success, error: r.error };
              if (r.success) {
                try {
                  const today = new Date().toISOString().slice(0, 10);
                  await supabase.from("sms_sent_log").insert({
                    student_id: `teacher:${teacherCivil || phone}`,
                    sms_type: "teacher_admin",
                    sent_date: today,
                  });
                  await archive({
                    report_type: "إرسال SMS للمعلم",
                    action_type: "send_sms",
                    teacher_name: teacherName,
                    teacher_civil_id: teacherCivil,
                    teacher_phone: phone,
                    summary: message,
                    payload: { phone, message, sent_at: new Date().toISOString() },
                  });
                } catch (archErr) {
                  console.warn("sms archive failed", archErr);
                }
              }
            } catch (e: any) {
              result = { success: false, error: e?.message || "خطأ غير متوقع" };
            }
          }
          try {
            ref.current?.contentWindow?.postMessage(
              { __lovable: true, type: "sms_result", source, reqId, ...result },
              "*",
            );
          } catch {}
        })();
        return;
      }
    }

    window.addEventListener("message", onMsg);
    return () => window.removeEventListener("message", onMsg);
  }, [source, title, isPrincipal, canImport]);

  const goFullscreen = () => {
    const node: any = wrapRef.current;
    if (!node) return;
    if (document.fullscreenElement) document.exitFullscreen?.();
    else node.requestFullscreen?.();
  };

  return (
    <div
      ref={wrapRef}
      className="w-full bg-card rounded-xl border overflow-hidden shadow-sm"
    >
      <div className="flex items-center justify-between gap-2 px-4 py-2.5 border-b bg-gradient-to-l from-primary/10 via-muted/40 to-transparent">
        <div className="flex items-center gap-2">
          <span className="inline-block w-2 h-2 rounded-full bg-primary" />
          <span className="font-bold text-sm text-foreground">{title}</span>
        </div>
        <div className="flex gap-1.5">
          <button
            onClick={() => setReloadKey((k) => k + 1)}
            title="إعادة تحميل"
            className="text-xs px-2.5 py-1 rounded-md border bg-background hover:bg-muted inline-flex items-center gap-1"
          >
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
          {source !== "admin_affairs" && (
            <button
              onClick={() => { try { ref.current?.contentWindow?.print(); } catch {} }}
              className="text-xs px-2.5 py-1 rounded-md border bg-background hover:bg-muted inline-flex items-center gap-1"
            >
              طباعة
            </button>
          )}
          <button
            onClick={goFullscreen}
            className="text-xs px-2.5 py-1 rounded-md border bg-background hover:bg-muted inline-flex items-center gap-1"
          >
            <Maximize2 className="w-3.5 h-3.5" />
            ملء الشاشة
          </button>
        </div>
      </div>
      <iframe
        key={reloadKey}
        ref={ref}
        src={src}
        title={title}
        className="w-full bg-background"
        style={{ height: "calc(100vh - 200px)", minHeight: 760, border: 0 }}
      />
    </div>
  );
}