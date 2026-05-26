// Elegant Arabic Certificate of Appreciation — A4 landscape, print-ready.
// The print window's title is set to the teacher's name so the browser's
// "Save as PDF" dialog suggests the right filename automatically.

export type CertificateTemplate = "royal-gold" | "emerald-classic" | "sapphire-modern" | "burgundy-heritage";

export interface CertificateData {
  teacherName: string;
  specialization?: string;
  reason?: string;
  hijriDate?: string;
  gregDate?: string;
  principalName: string;
  viceName: string;
  schoolName: string;
  template?: CertificateTemplate;
}

const sanitize = (s: string) => s.replace(/[\\/:*?"<>|\n\r\t]/g, " ").trim();

// Bundle the official school seal so it travels into the print window.
import schoolSealUrl from "@/assets/school-official-seal.png";

/**
 * Build an absolute URL for the seal so it works inside `window.open("")`
 * (which has an `about:blank` base and cannot resolve relative paths).
 */
function absoluteSealUrl(): string {
  try {
    return new URL(schoolSealUrl, window.location.origin).href;
  } catch {
    return schoolSealUrl as unknown as string;
  }
}

/* ------------------------------------------------------------------ */
/* Premium template palette — each one is a complete visual identity  */
/* ------------------------------------------------------------------ */
const TEMPLATES: Record<CertificateTemplate, {
  bg: string;
  paper: string;
  ink: string;
  gold: string;
  goldDeep: string;
  goldSoft: string;
  accent: string;
  ribbon: string;
}> = {
  "royal-gold": {
    bg: "radial-gradient(ellipse at top,#fff9e6 0%,#fff5d4 45%,#f6e7b0 100%)",
    paper: "#fffdf5",
    ink: "#2b1f04",
    gold: "#c9a227",
    goldDeep: "#8a6a13",
    goldSoft: "#e7c96b",
    accent: "#7a5a14",
    ribbon: "linear-gradient(135deg,#a87a18 0%,#e8c453 50%,#a87a18 100%)",
  },
  "emerald-classic": {
    bg: "radial-gradient(ellipse at top,#f4fbf6 0%,#e8f5ec 50%,#d6ead9 100%)",
    paper: "#fdfffd",
    ink: "#0f2e1c",
    gold: "#b08a2e",
    goldDeep: "#7a5e16",
    goldSoft: "#dec678",
    accent: "#155e3b",
    ribbon: "linear-gradient(135deg,#0d4a30 0%,#1f7a52 50%,#0d4a30 100%)",
  },
  "sapphire-modern": {
    bg: "radial-gradient(ellipse at top,#f3f7ff 0%,#e7eefb 50%,#d4def5 100%)",
    paper: "#fbfcff",
    ink: "#0e1a3a",
    gold: "#b08a2e",
    goldDeep: "#7a5e16",
    goldSoft: "#dec678",
    accent: "#1d3a8a",
    ribbon: "linear-gradient(135deg,#152c70 0%,#2e55c2 50%,#152c70 100%)",
  },
  "burgundy-heritage": {
    bg: "radial-gradient(ellipse at top,#fff7f7 0%,#fbeaea 50%,#f4d4d4 100%)",
    paper: "#fffafa",
    ink: "#3a0e14",
    gold: "#c9a227",
    goldDeep: "#8a6a13",
    goldSoft: "#e7c96b",
    accent: "#7d1424",
    ribbon: "linear-gradient(135deg,#5e0d1c 0%,#a3253b 50%,#5e0d1c 100%)",
  },
};

/* ------------------------------------------------------------------ */
/* SVG ornament: a refined Arabesque corner used at all four corners  */
/* ------------------------------------------------------------------ */
function cornerOrnament(color: string, soft: string): string {
  return `
    <svg viewBox="0 0 120 120" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="og" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stop-color="${color}"/>
          <stop offset="100%" stop-color="${soft}"/>
        </linearGradient>
      </defs>
      <g fill="none" stroke="url(#og)" stroke-width="1.6">
        <path d="M5 60 Q5 5 60 5"/>
        <path d="M15 60 Q15 15 60 15"/>
        <path d="M25 60 Q25 25 60 25"/>
        <circle cx="40" cy="40" r="6" stroke-width="1.2"/>
        <path d="M40 22 Q55 30 58 45"/>
        <path d="M22 40 Q30 55 45 58"/>
      </g>
      <g fill="${color}" opacity=".35">
        <circle cx="40" cy="40" r="2"/>
        <circle cx="22" cy="60" r="1.5"/>
        <circle cx="60" cy="22" r="1.5"/>
      </g>
    </svg>`;
}

function medallionSvg(color: string, soft: string): string {
  return `
    <svg viewBox="0 0 120 120" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <radialGradient id="mg" cx="50%" cy="40%" r="60%">
          <stop offset="0%" stop-color="${soft}"/>
          <stop offset="100%" stop-color="${color}"/>
        </radialGradient>
      </defs>
      <circle cx="60" cy="55" r="40" fill="url(#mg)" stroke="${color}" stroke-width="2"/>
      <circle cx="60" cy="55" r="32" fill="none" stroke="#fff" stroke-width="1.2" opacity=".7"/>
      <text x="60" y="62" font-family="Cairo,Tahoma,sans-serif" font-size="22"
            font-weight="900" text-anchor="middle" fill="#fff">★</text>
      <path d="M30 88 L50 110 L60 95 L70 110 L90 88 Z"
            fill="${color}" stroke="${soft}" stroke-width="1"/>
    </svg>`;
}

/* ------------------------------------------------------------------ */
/* Build the printable HTML                                           */
/* ------------------------------------------------------------------ */
export function buildCertificateHtml(data: CertificateData): string {
  const t = TEMPLATES[data.template || "royal-gold"];
  const filename = `شهادة شكر وتقدير - ${sanitize(data.teacherName)}`;

  const reasonText =
    data.reason && data.reason.trim().length > 0
      ? data.reason.trim()
      : "تقديراً لما قدّمه من جهودٍ مخلصةٍ، وعطاءٍ لا ينضب، وحرصٍ صادقٍ على بناء جيلٍ واعٍ متعلمٍ، فكنتم نِعم القدوة، ونعم المربي الفاضل.";

  return `<!doctype html>
<html lang="ar" dir="rtl">
<head>
<meta charset="utf-8" />
<title>${filename}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Amiri:wght@400;700&family=Cairo:wght@400;600;700;900&family=Reem+Kufi:wght@500;700&display=swap" rel="stylesheet">
<style>
  @page { size: A4 landscape; margin: 0; }
  *, *::before, *::after { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  :root {
    --cert-paper: ${t.paper};
    --cert-accent: ${t.accent};
    --cert-gold: ${t.gold};
    --cert-gold-soft: ${t.goldSoft};
  }
  html, body { margin: 0; padding: 0; font-family: 'Cairo','Tahoma',sans-serif; background:#dcdcdc; color:${t.ink}; }

  .toolbar {
    position: fixed; top: 14px; left: 14px; z-index: 50;
    background:#fff; border:1px solid #ddd; border-radius: 10px;
    padding: 8px 12px; box-shadow: 0 6px 18px rgba(0,0,0,.12);
    font-family: Cairo, Tahoma, sans-serif; display: flex; gap: 8px;
  }
  .toolbar button {
    background: ${t.accent}; color:#fff; border:0; padding: 8px 16px;
    border-radius: 8px; cursor: pointer; font-weight: 800; font-size: 13px;
  }
  .toolbar button.alt { background: #25D366; }

  .page {
    width: 297mm; height: 210mm; margin: 0 auto;
    background: ${t.bg};
    position: relative;
    page-break-after: always;
    overflow: hidden;
  }

  /* Outer + inner double frame */
  .frame-outer {
    position: absolute; inset: 6mm;
    border: 2.5px solid ${t.gold};
    border-radius: 14px;
    background: ${t.paper};
    box-shadow: inset 0 0 0 1px rgba(255,255,255,.8), 0 10px 40px rgba(0,0,0,.08);
  }
  .frame-inner {
    position: absolute; inset: 10mm;
    border: 1px solid ${t.goldSoft};
    border-radius: 10px;
    padding: 8mm 14mm 16mm;
    display: flex; flex-direction: column; align-items: center;
    justify-content: flex-start;
    background:
      radial-gradient(ellipse at center top, rgba(255,255,255,.4) 0%, transparent 70%),
      ${t.paper};
  }

  /* Decorative gold corners */
  .corner {
    position: absolute; width: 28mm; height: 28mm; pointer-events: none;
  }
  .corner.tl { top: 4mm; right: 4mm; }
  .corner.tr { top: 4mm; left: 4mm; transform: scaleX(-1); }
  .corner.bl { bottom: 4mm; right: 4mm; transform: scaleY(-1); }
  .corner.br { bottom: 4mm; left: 4mm; transform: scale(-1,-1); }

  /* Header */
  .header { text-align: center; margin-top: 2mm; }
  .school {
    font-family: 'Reem Kufi', Cairo, sans-serif;
    font-size: 15pt; font-weight: 700; color: ${t.accent};
    letter-spacing: .5px;
  }
  .ministry {
    font-size: 9.5pt; color: #6b6357; margin-top: 2px; font-weight: 500;
    letter-spacing: .3px;
  }
  .divider {
    margin: 6px auto;
    width: 60mm; height: 1px;
    background: linear-gradient(90deg, transparent, ${t.gold}, transparent);
    position: relative;
  }
  .divider::after {
    content: "❖"; position: absolute; left: 50%; top: 50%;
    transform: translate(-50%,-50%); color: ${t.gold};
    background: ${t.paper}; padding: 0 6px; font-size: 9pt;
  }

  /* Title ribbon */
  .ribbon-wrap { margin-top: 2mm; position: relative; }
  .ribbon {
    display: inline-block; padding: 10px 44px;
    background: ${t.ribbon}; color: #fff;
    font-family: 'Reem Kufi', 'Cairo', sans-serif;
    font-size: 26pt; font-weight: 700; letter-spacing: 4px;
    border-radius: 4px;
    box-shadow: 0 6px 18px rgba(0,0,0,.20), inset 0 1px 0 rgba(255,255,255,.4);
    text-shadow: 0 1px 0 rgba(0,0,0,.2);
    position: relative;
  }
  .ribbon::before, .ribbon::after {
    content: ""; position: absolute; top: 50%; width: 24px; height: 18px;
    background: ${t.ribbon}; transform: translateY(-50%);
    clip-path: polygon(0 0, 100% 50%, 0 100%);
    filter: brightness(.8);
  }
  .ribbon::before { right: -22px; }
  .ribbon::after { left: -22px; transform: translateY(-50%) scaleX(-1); }
  .subtitle {
    margin-top: 8mm; font-family: 'Amiri', serif;
    font-size: 18pt; color: ${t.accent}; font-weight: 700;
  }

  /* Body */
  .body { text-align: center; max-width: 230mm; margin: 3mm auto 0; flex: 1 1 auto; }
  .lead {
    font-family: 'Amiri', serif;
    font-size: 15pt; color: #3a2f15; line-height: 1.55;
  }
  .name-wrap {
    margin: 5mm auto 3mm;
    display: inline-block;
    padding: 6px 28px;
    position: relative;
  }
  .name {
    font-family: 'Reem Kufi', 'Cairo', sans-serif;
    font-size: 32pt; font-weight: 700; color: ${t.accent};
    letter-spacing: 1.5px;
    text-shadow: 0 1px 0 rgba(255,255,255,.7);
  }
  .name-wrap::before, .name-wrap::after {
    content: ""; position: absolute; bottom: -2px; height: 2px; width: 38%;
    background: linear-gradient(90deg, transparent, ${t.gold}, transparent);
  }
  .name-wrap::before { right: 0; }
  .name-wrap::after  { left: 0; }

  .spec {
    font-size: 12pt; color: #6b5b32; margin-bottom: 5mm; font-weight: 600;
  }
  .reason {
    font-family: 'Amiri', serif;
    font-size: 14pt; color: ${t.ink}; line-height: 1.9;
    padding: 0 10mm; max-width: 220mm; margin: 0 auto;
    text-align: center;
  }

  /* Footer */
  .footer {
    width: 100%; display: grid; grid-template-columns: 1fr 44mm 1fr;
    align-items: end; gap: 6mm; margin-top: auto;
    padding: 0 4mm 8mm;
    transform: translateY(-12mm);
  }
  .sig { text-align: center; min-width: 0; transform: translateY(-10mm); }
  .sig .role {
    font-size: 10.5pt; color: #6b5b32; margin-bottom: 7px; font-weight: 600;
  }
  .sig .who {
    font-size: clamp(11pt, 1.16vw, 13pt); font-weight: 800; color: ${t.accent};
    border-top: 1.5px solid ${t.gold}; padding-top: 5px;
    display: block; width: 100%; max-width: 88mm; margin: 0 auto;
    white-space: nowrap; overflow: visible;
    line-height: 1.2;
  }
  .seal {
    text-align: center;
    transform: translateY(4mm);
  }
  .seal img {
    width: 48mm; height: 48mm;
    object-fit: contain;
    transform: rotate(-4deg);
    opacity: .95;
    filter: drop-shadow(0 1px 1px rgba(0,0,0,.08));
  }
  .seal .seal-caption {
    margin-top: 3mm;
    font-size: 9.5pt; font-weight: 700;
    color: ${t.accent};
    letter-spacing: .3px;
  }
  .dates {
    margin-top: 3mm; font-size: 10pt; color: #6b5b32;
    font-weight: 600; letter-spacing: .3px;
  }
  .medallion {
    position: absolute; left: 18mm; top: 22mm;
    width: 22mm; height: 22mm; opacity: .9;
  }
  .medallion-r {
    position: absolute; right: 18mm; top: 22mm;
    width: 22mm; height: 22mm; opacity: .9; transform: scaleX(-1);
  }

  @media print {
    body { background: #fff; }
    .page { margin: 0; }
    .no-print { display: none !important; }
  }
</style>
</head>
<body>
  <div class="toolbar no-print">
    <button onclick="window.print()">🖨️ حفظ بصيغة PDF / طباعة</button>
  </div>

  <div class="page">
    <div class="frame-outer">
      <div class="corner tl">${cornerOrnament(t.gold, t.goldSoft)}</div>
      <div class="corner tr">${cornerOrnament(t.gold, t.goldSoft)}</div>
      <div class="corner bl">${cornerOrnament(t.gold, t.goldSoft)}</div>
      <div class="corner br">${cornerOrnament(t.gold, t.goldSoft)}</div>

      <div class="medallion">${medallionSvg(t.accent, t.goldSoft)}</div>
      <div class="medallion-r">${medallionSvg(t.accent, t.goldSoft)}</div>

      <div class="frame-inner">
        <div class="header">
          <div class="school">${escapeHtml(data.schoolName)}</div>
          <div class="ministry">المملكة العربية السعودية &mdash; وزارة التعليم</div>
          <div class="divider"></div>
          <div class="ribbon-wrap">
            <div class="ribbon">شهادة شكر وتقدير</div>
          </div>
          <div class="subtitle">تكريماً للعطاء والتميّز</div>
        </div>

        <div class="body">
          <div class="lead">يطيب لإدارة المدرسة أن تتقدّم بأسمى آيات الشكر والتقدير<br/>إلى الأستاذ الفاضل</div>
          <div class="name-wrap"><div class="name">${escapeHtml(data.teacherName)}</div></div>
          <div class="reason">${escapeHtml(reasonText)}</div>
          <div class="dates">
            ${data.hijriDate ? escapeHtml(data.hijriDate) : ""}
            ${data.hijriDate && data.gregDate ? " &nbsp;&bull;&nbsp; " : ""}
            ${data.gregDate ? escapeHtml(data.gregDate) : ""}
          </div>
        </div>

        <div class="footer">
          <div class="sig">
            <div class="role">وكيل الشؤون التعليمية</div>
            <div class="who">${escapeHtml(data.viceName)}</div>
          </div>
          <div class="seal">
            <img src="${absoluteSealUrl()}" alt="ختم المدرسة الرسمي" crossorigin="anonymous"/>
          </div>
          <div class="sig">
            <div class="role">مدير المدرسة</div>
            <div class="who">${escapeHtml(data.principalName)}</div>
          </div>
        </div>
      </div>
    </div>
  </div>

  <script>
    document.title = ${JSON.stringify(filename)};
  </script>
</body>
</html>`;
}

function escapeHtml(s: string): string {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function openCertificateWindow(data: CertificateData): void {
  const html = buildCertificateHtml(data);
  const win = window.open("", "_blank", "width=1200,height=820");
  if (!win) {
    alert("يرجى السماح بالنوافذ المنبثقة لطباعة الشهادة.");
    return;
  }
  win.document.open();
  win.document.write(html);
  win.document.close();
}

/* ------------------------------------------------------------------ */
/* Refined preset reasons — premium pedagogical phrasing              */
/* ------------------------------------------------------------------ */
export const PRESET_REASONS: string[] = [
  "تقديراً لما قدّمتموه من جهودٍ مخلصةٍ وعطاءٍ متميّز، وحرصٍ صادقٍ على بناء جيلٍ واعٍ متعلم. فكنتم نِعم القدوة، ونِعم المربي الفاضل، فلكم منا كل الشكر والاحترام.",
  "اعترافاً بفضلكم وعرفاناً بجميل عطائكم في الميدان التربوي، وإسهاماتكم النيّرة في الارتقاء بمستوى الأداء التعليمي وغرس القيم الفاضلة في نفوس الطلاب.",
  "تثميناً لتميّزكم في الأداء، وانضباطكم في العمل، ومبادراتكم الفاعلة التي أثرت العملية التعليمية، وأسهمت في تحقيق رسالة المدرسة ورؤيتها التربوية.",
  "شكراً لكم على ما بذلتموه من جهودٍ متواصلة في النهوض بالمستوى التحصيلي للطلاب، وحرصكم الدائم على تطبيق أفضل الممارسات التعليمية الحديثة.",
  "تقديراً لروح الفريق التي تتحلّون بها، ومشاركتكم الفاعلة في الأنشطة المدرسية، ودوركم الريادي في إثراء البيئة التعليمية وتعزيز الانتماء.",
  "عرفاناً بدوركم البارز في تنشئة جيلٍ واعٍ متمسكٍ بقيمه ودينه ووطنه، وما قدّمتموه من قدوةٍ حسنة وأسلوبٍ تربويٍّ راقٍ يستحق كل تقدير.",
  "تكريماً لإبداعاتكم في توظيف التقنية والوسائل التعليمية الحديثة، وحرصكم على التطوير المهني المستمر، وأثركم الإيجابي في مسيرة الطلاب.",
  "شكراً لكم على إخلاصكم في أداء الرسالة التعليمية، وتفانيكم في خدمة الطلاب، ومساهماتكم الفاعلة في رفع راية المدرسة وتحقيق أهدافها التربوية.",
  "تقديراً لجهودكم المباركة في متابعة الطلاب أكاديمياً وسلوكياً، وحرصكم على تنمية مهاراتهم وصقل شخصياتهم بأسلوبٍ تربويٍّ راقٍ مفعمٍ بالحكمة.",
];

export const TEMPLATE_OPTIONS: { value: CertificateTemplate; label: string }[] = [
  { value: "royal-gold", label: "ملكي ذهبي (موصى به)" },
  { value: "emerald-classic", label: "زمردي كلاسيكي" },
  { value: "sapphire-modern", label: "ياقوتي عصري" },
  { value: "burgundy-heritage", label: "تراثي عنابي" },
];