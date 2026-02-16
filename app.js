// 1) تسجيل الـ Service Worker
if ('serviceWorker' in navigator) {
  window.addEventListener('load', async () => {
    const reg = await navigator.serviceWorker.register('./sw.js');

    // 2) دالة ترسل رسالة للـ SW الجديد إذا كان "waiting"
    const اطلب_تفعيل_التحديث = () => {
      if (reg.waiting) {
        reg.waiting.postMessage({ type: 'ذكرني_بالتحديث' });
      }
    };

    // 3) إذا كان فيه تحديث جاهز مسبقًا
    if (reg.waiting) اطلب_تفعيل_التحديث();

    // 4) عند وجود تحديث جديد
    reg.addEventListener('updatefound', () => {
      const sw = reg.installing;
      if (!sw) return;

      sw.addEventListener('statechange', () => {
        // "installed" + يوجد controller يعني تحديث (مو أول تثبيت)
        if (sw.state === 'installed' && navigator.serviceWorker.controller) {
          اطلب_تفعيل_التحديث();
        }
      });
    });

    // 5) بمجرد ما يتغير الـ controller (صار SW الجديد هو المتحكم) → نعمل Reload مرة واحدة
    let reloaded = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (reloaded) return;
      reloaded = true;
      window.location.reload();
    });
  });
}
