تشغيل التطبيق (PWA)

1) تأكد أن الملفات موجودة داخل نفس المجلد:
- index.html
- sw.js
- manifest.webmanifest
- icons/icon-192.png
- icons/icon-512.png

2) مهم جداً:
- لا يعمل Service Worker من فتح الملف مباشرة (file://).
- يجب تشغيله عبر http://localhost أو https.

3) تشغيل محلي سريع (Mac/Windows):
- افتح الطرفية داخل مجلد المشروع ثم شغّل:
  python3 -m http.server 8000
- افتح المتصفح:
  http://localhost:8000/

4) تثبيت كتطبيق:
- Chrome: من شريط العنوان (Install app) أو من القائمة (Install).
- iPhone/iPad (Safari): Share -> Add to Home Screen.

5) عند تحديث الملفات:
- إذا عدلت index / manifest / sw: غيّر رقم VERSION داخل sw.js (مثلاً v12 إلى v13).
- بعدها افتح الصفحة واعمل تحديث (Ctrl+R).
- إن واجهت كاش قديم: افتح DevTools > Application > Service Workers ثم Unregister
  أو امسح بيانات الموقع (Clear storage).
