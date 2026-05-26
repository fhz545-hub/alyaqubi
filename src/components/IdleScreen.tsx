import { useEffect, useState } from "react";
import UnifiedWaitScreen from "./UnifiedWaitScreen";

const IDLE_TIMEOUT_MS = 5 * 60_000; // خمس دقائق من عدم النشاط

/**
 * شاشة انتظار بيضاء صافية مع حركات بصرية إبداعية على الشعار.
 * تظهر بعد دقيقة من عدم النشاط (لا حركة ماوس / لا لمس / لا مفتاح / لا تمرير).
 * تُغلق فور تحريك الماوس أو لمس الشاشة.
 */
export default function IdleScreen() {
  const [idle, setIdle] = useState(false);
  const [forceLoading, setForceLoading] = useState(false);

  useEffect(() => {
    let timer: number | undefined;
    const reset = () => {
      if (timer) window.clearTimeout(timer);
      setIdle((prev) => (prev ? false : prev));
      timer = window.setTimeout(() => setIdle(true), IDLE_TIMEOUT_MS);
    };

    const events: (keyof WindowEventMap)[] = [
      "mousemove",
      "mousedown",
      "keydown",
      "touchstart",
      "touchmove",
      "scroll",
      "wheel",
      "pointermove",
    ];
    events.forEach((e) => window.addEventListener(e, reset, { passive: true }));
    reset();

    // أحداث مخصصة لإظهار الشاشة أثناء التحميل أو عند الطلب
    const onShow = () => setForceLoading(true);
    const onHide = () => setForceLoading(false);
    window.addEventListener("lovable:loading:start", onShow);
    window.addEventListener("lovable:loading:end", onHide);

    return () => {
      events.forEach((e) => window.removeEventListener(e, reset));
      window.removeEventListener("lovable:loading:start", onShow);
      window.removeEventListener("lovable:loading:end", onHide);
      if (timer) window.clearTimeout(timer);
    };
  }, []);

  const visible = idle || forceLoading;
  if (!visible) return null;

  return (
    <UnifiedWaitScreen
      message={forceLoading ? "جارٍ التحميل" : "مدرسة اليعقوبي الثانوية"}
      hint={forceLoading ? "نقوم بتجهيز ملفاتك، لحظات من فضلك" : "شاشة الانتظار — حرّك الماوس أو المس الشاشة للمتابعة"}
      role="dialog"
      zIndexClass="z-[2147483646]"
      onDismiss={() => { if (!forceLoading) setIdle(false); }}
    />
  );
}