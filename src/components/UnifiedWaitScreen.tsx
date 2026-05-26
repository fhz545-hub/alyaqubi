import logoUrl from "@/assets/yaqoubi-logo.jpeg";

interface UnifiedWaitScreenProps {
  message?: string;
  hint?: string;
  role?: "status" | "dialog";
  zIndexClass?: string;
  onDismiss?: () => void;
}

export default function UnifiedWaitScreen({
  message = "مدرسة اليعقوبي الثانوية",
  hint = "نقوم بتجهيز ملفاتك، لحظات من فضلك",
  role = "status",
  zIndexClass = "z-[2147483645]",
  onDismiss,
}: UnifiedWaitScreenProps) {
  return (
    <div
      className={`fixed inset-0 ${zIndexClass} grid place-items-center bg-background animate-fade-in`}
      dir="rtl"
      role={role}
      aria-live={role === "status" ? "polite" : undefined}
      aria-label={message}
      onClick={onDismiss}
      onTouchStart={onDismiss}
    >
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-32 -right-32 w-[420px] h-[420px] rounded-full bg-primary/5 blur-3xl wait-pulse-slow" />
        <div className="absolute -bottom-40 -left-32 w-[460px] h-[460px] rounded-full bg-primary/5 blur-3xl wait-pulse-slow" style={{ animationDelay: "1.2s" }} />
      </div>

      <div className="relative flex flex-col items-center gap-5 sm:gap-6 px-6 text-center">
        <div className="relative w-[clamp(190px,34vmin,420px)] h-[clamp(190px,34vmin,420px)] grid place-items-center">
          <span className="absolute inset-0 rounded-full border-2 border-primary/30 wait-ring" />
          <span className="absolute inset-0 rounded-full border-2 border-primary/25 wait-ring" style={{ animationDelay: "0.6s" }} />
          <span className="absolute inset-0 rounded-full border-2 border-primary/20 wait-ring" style={{ animationDelay: "1.2s" }} />
          <span className="absolute inset-0 rounded-full border-2 border-primary/10 wait-ring" style={{ animationDelay: "1.8s" }} />
          <span className="absolute w-[78%] h-[78%] rounded-full bg-primary/5 blur-2xl wait-pulse-slow" />
          <div className="relative w-[78%] h-[78%] rounded-full bg-background shadow-[0_24px_60px_-18px_hsl(var(--foreground)/0.22)] grid place-items-center wait-float">
            <img
              src={logoUrl}
              alt="مدرسة اليعقوبي الثانوية"
              className="w-[82%] h-[82%] object-contain rounded-full wait-breathe"
              draggable={false}
            />
          </div>
        </div>

        <div className="space-y-1.5">
          <p className="text-lg md:text-2xl font-extrabold text-foreground tracking-tight">{message}</p>
          {hint && <p className="text-xs md:text-sm text-muted-foreground">{hint}</p>}
        </div>

        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-primary wait-dot" />
          <span className="w-2 h-2 rounded-full bg-primary wait-dot" style={{ animationDelay: "0.15s" }} />
          <span className="w-2 h-2 rounded-full bg-primary wait-dot" style={{ animationDelay: "0.3s" }} />
        </div>
      </div>

      <style>{`
        @keyframes wait-ring-anim { 0% { transform: scale(0.85); opacity: 0.9; } 80% { opacity: 0; } 100% { transform: scale(1.45); opacity: 0; } }
        @keyframes wait-float-anim { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-6px); } }
        @keyframes wait-breathe-anim { 0%, 100% { transform: scale(1); filter: drop-shadow(0 4px 14px hsl(var(--foreground) / 0.08)); } 50% { transform: scale(1.04); filter: drop-shadow(0 10px 22px hsl(var(--foreground) / 0.14)); } }
        @keyframes wait-dot-anim { 0%, 80%, 100% { opacity: 0.25; transform: translateY(0); } 40% { opacity: 1; transform: translateY(-4px); } }
        @keyframes wait-pulse-slow-anim { 0%, 100% { opacity: 0.5; } 50% { opacity: 1; } }
        .wait-ring { animation: wait-ring-anim 2.4s ease-out infinite; }
        .wait-float { animation: wait-float-anim 3.6s ease-in-out infinite; }
        .wait-breathe { animation: wait-breathe-anim 3s ease-in-out infinite; }
        .wait-dot { animation: wait-dot-anim 1.2s ease-in-out infinite; }
        .wait-pulse-slow { animation: wait-pulse-slow-anim 4s ease-in-out infinite; }
        @media (prefers-reduced-motion: reduce) {
          .wait-ring, .wait-float, .wait-breathe, .wait-dot, .wait-pulse-slow { animation: none; }
        }
      `}</style>
    </div>
  );
}