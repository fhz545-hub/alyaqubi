# راصد • متابعة المواظبة والسلوك (Offline PWA)

## 1) تشغيل محليًا
افتح `index.html` مباشرة أو ارفع المشروع على GitHub Pages.

## 2) بيانات الطلاب (600 طالب)
تم تضمين ملف افتراضي داخل:
- `assets/students_default.json`
- `assets/StudentGuidance_clean.csv`

عند أول فتح للتطبيق سيقوم بتحميل البيانات تلقائيًا إذا كانت قاعدة الطلاب فارغة.

## 3) استيراد ملف جديد
من: **الإعدادات → إدارة البيانات → استيراد CSV**
ويجب أن يحتوي الملف على الأعمدة:
- اسم الطالب
- رقم الطالب (رقم الهوية/السجل المدني)
- الجوال
- رقم الصف
- الفصل (الشعبة)

## 4) طباعة الكشوف
من: **الكشوف والطباعة**
- كشف متابعة تأخر الطلاب
- كشف متابعة غياب الطلاب

الكشف A4 أفقي، ويحتوي الأعمدة: الأحد–الخميس + باركود رقم الهوية.

## 5) SMS بشكل آمن (Proxy عبر Cloudflare Worker)
> لا تضع توكن مزود الـ SMS داخل GitHub أو داخل التطبيق.

### الخطوات المختصرة
1) Cloudflare → Workers & Pages → Create application → **Start with Hello World** → Deploy
2) افتح Worker → **Edit code**
3) احذف كود "Hello World" بالكامل والصق محتوى `cloudflare-worker.js` ثم Deploy
4) Settings → Variables and Secrets:
   - `MOBILE_TOKEN` (Secret)
   - `PROXY_KEY` (Secret)
   - `API_BASE` = `https://app.mobile.net.sa/api/v1` (Variable)
   - `ALLOWED_ORIGINS` (اختياري)

5) في التطبيق: الإعدادات
   - Proxy URL = رابط الـ Worker
   - Proxy Key = نفس قيمة `PROXY_KEY`

الآن زر "إرسال SMS" يعمل دون كشف التوكن.

## ملاحظة
قائمة المخالفات السلوكية في `rules.js` افتراضية وقابلة للتعديل لتطابق الدليل المعتمد لديكم.
