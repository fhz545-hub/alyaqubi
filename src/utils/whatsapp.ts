import { Student, ActionType, SCHOOL_INFO, VIOLATION_DEGREES, VIOLATION_PROCEDURES } from "@/types/school";
import { getFullHijriDate } from "@/utils/hijri";

const SAUDI_MOBILE_REGEX = /^9665\d{8}$/;

/**
 * Format Saudi phone number to international format
 * Handles: 05XXXXXXXX, 5XXXXXXXX, 9665XXXXXXXX, +9665XXXXXXXX, 009665XXXXXXXX
 */
export const formatSaudiPhone = (phone: string): string => {
  let clean = phone.replace(/[^0-9]/g, "").trim();

  if (clean.startsWith("00")) clean = clean.slice(2);
  if (clean.startsWith("9660")) clean = `966${clean.slice(4)}`;
  else if (clean.startsWith("0")) clean = `966${clean.slice(1)}`;
  else if (clean.startsWith("5")) clean = `966${clean}`;
  else if (!clean.startsWith("966")) clean = `966${clean}`;

  return clean;
};

export const isValidSaudiPhone = (phone: string): boolean => {
  const formatted = formatSaudiPhone(phone);
  return SAUDI_MOBILE_REGEX.test(formatted);
};

// رقم واتساب المدرسة الرسمي
export const SCHOOL_WHATSAPP_NUMBER = "966579812911";

export const buildWhatsAppUrl = (phone: string, message: string) => {
  const formattedPhone = formatSaudiPhone(phone);
  const encodedMessage = encodeURIComponent(message);
  // Use wa.me only — api.whatsapp.com blocked by CORS (ERR_BLOCKED_BY_RESPONSE)
  return `https://wa.me/${formattedPhone}?text=${encodedMessage}`;
};

/**
 * Generate contextual violation message body based on the specific violation category
 */
const getViolationMessageBody = (category: string, studentName: string, degree: number): string => {
  const cat = category.trim();

  // --- الدرجة الثالثة ---
  if (cat.includes("هروب") || cat.includes("الهروب من المدرسة"))
    return `نحيطكم علمًا بأنه تم رصد خروج الطالب/ ${studentName} من المدرسة دون إذن (هروب) خلال اليوم الدراسي، وهو سلوك يُعد مخالفة جسيمة للأنظمة والتعليمات المدرسية. وقد تم توثيق الحالة في سجل الطالب وفق لائحة السلوك والمواظبة، واتخاذ الإجراءات النظامية المعتمدة حيالها.\n\nنأمل مراجعتكم للمدرسة في أقرب وقت لاستكمال ما يلزم، وتعزيز التزام الطالب بالأنظمة حفاظًا على سلامته وانتظامه الدراسي.`;

  if (cat.includes("شجار") || cat.includes("مضاربة"))
    return `نحيطكم علمًا بأن الطالب/ ${studentName} اشترك اليوم في شجار داخل المدرسة، وهو سلوك مرفوض يتعارض مع القيم التربوية والأنظمة المعتمدة. وقد تم التعامل مع الموقف تربويًا وتوثيقه وفق لائحة السلوك والمواظبة.\n\nنأمل تعاونكم في توجيه الطالب نحو حل الخلافات بالحوار، ومراجعة المدرسة لاستكمال الإجراءات اللازمة.`;

  if (cat.includes("ألفاظ نابية") || cat.includes("تهديد"))
    return `نحيطكم علمًا بأن الطالب/ ${studentName} تلفّظ اليوم بألفاظ غير لائقة تجاه زملائه، وهو سلوك يخالف الآداب العامة ولائحة السلوك والمواظبة. وقد تم توثيق المخالفة واتخاذ الإجراءات التربوية المعتمدة.\n\nنأمل تعاونكم في تعزيز احترام الآخرين لدى الطالب، ومراجعة المدرسة عند الحاجة.`;

  if (cat.includes("سرقة"))
    return `نحيطكم علمًا بأنه تم ضبط حالة سرقة تورّط فيها الطالب/ ${studentName} داخل المحيط المدرسي، وقد تم التعامل مع الموقف تربويًا وتوثيقه وفق لائحة السلوك والمواظبة.\n\nنأمل مراجعتكم للمدرسة في أقرب وقت لاستكمال الإجراءات النظامية، والتعاون في تعزيز القيم الأخلاقية لدى الطالب.`;

  if (cat.includes("تصوير") || cat.includes("تسجيل"))
    return `نحيطكم علمًا بأن الطالب/ ${studentName} قام بالتصوير أو التسجيل داخل المدرسة دون إذن، وهو سلوك يخالف الأنظمة المعتمدة وخصوصية الآخرين. وقد تم توثيق المخالفة واتخاذ الإجراءات التربوية وفق لائحة السلوك والمواظبة.\n\nنأمل تعاونكم في توعية الطالب بأهمية احترام الخصوصية والأنظمة المدرسية.`;

  if (cat.includes("إتلاف") || cat.includes("العبث بتجهيزات"))
    return `نحيطكم علمًا بأن الطالب/ ${studentName} تسبّب في إتلاف أو إلحاق ضرر بممتلكات المدرسة، وقد تم توثيق المخالفة واتخاذ الإجراءات التربوية المعتمدة وفق لائحة السلوك والمواظبة.\n\nنأمل مراجعتكم للمدرسة لاستكمال ما يلزم، والتعاون في غرس قيمة المحافظة على الممتلكات العامة.`;

  if (cat.includes("مواد") || cat.includes("ألعاب خطرة"))
    return `نحيطكم علمًا بأنه تم ضبط الطالب/ ${studentName} بحوزته مواد أو أدوات ممنوعة داخل المدرسة، وقد تمت مصادرتها وتوثيق المخالفة وفق لائحة السلوك والمواظبة.\n\nنأمل مراجعتكم للمدرسة في أقرب وقت لاستكمال الإجراءات النظامية، والتأكد من عدم تكرار ذلك حفاظًا على سلامة الطالب وزملائه.`;

  if (cat.includes("كتابة على الجدران"))
    return `نحيطكم علمًا بأن الطالب/ ${studentName} قام بالكتابة على جدران المدرسة أو ممتلكاتها، وقد تم توثيق المخالفة واتخاذ الإجراءات التربوية المعتمدة.\n\nنأمل تعاونكم في توجيه الطالب للمحافظة على نظافة المرافق المدرسية وممتلكاتها.`;

  if (cat.includes("توقيع عن ولي الأمر") || cat.includes("تزوير"))
    return `نحيطكم علمًا بأنه تبيّن قيام الطالب/ ${studentName} بالتوقيع نيابةً عن ولي الأمر دون علمه، وهو سلوك يُعد مخالفًا للأمانة والأنظمة المدرسية. وقد تم توثيق المخالفة واتخاذ الإجراءات وفق لائحة السلوك والمواظبة.\n\nنأمل مراجعتكم للمدرسة لاستكمال ما يلزم.`;

  // --- الدرجة الأولى والثانية ---
  if (cat.includes("الزي المدرسي"))
    return `نحيطكم علمًا بأن الطالب/ ${studentName} لم يلتزم بالزي المدرسي المعتمد اليوم، وقد تم توجيهه تربويًا وتوثيق الملاحظة وفق لائحة السلوك والمواظبة.\n\nنأمل تعاونكم في التأكد من التزام الطالب بالزي المدرسي يوميًا.`;

  if (cat.includes("النوم داخل الفصل"))
    return `نحيطكم علمًا بأن الطالب/ ${studentName} لوحظ عليه النوم أثناء الحصة الدراسية اليوم، وقد تم توجيهه تربويًا وتوثيق الملاحظة.\n\nنأمل متابعتكم لنوم الطالب ليلًا بشكل كافٍ لضمان تركيزه وانتباهه خلال اليوم الدراسي.`;

  if (cat.includes("فوضى") || cat.includes("إثارة الفوضى"))
    return `نحيطكم علمًا بأن الطالب/ ${studentName} تسبب في إثارة الفوضى داخل الفصل أو المدرسة اليوم، مما أثّر على سير العملية التعليمية. وقد تم توجيهه تربويًا وتوثيق المخالفة.\n\nنأمل تعاونكم في حث الطالب على الالتزام بالنظام واحترام بيئة التعلم.`;

  if (cat.includes("الخروج من الفصل دون استئذان"))
    return `نحيطكم علمًا بأن الطالب/ ${studentName} خرج من الفصل اليوم دون استئذان من المعلم، وقد تم توجيهه تربويًا وتوثيق الملاحظة.\n\nنأمل تعاونكم في تعزيز الالتزام بالأنظمة الصفية لدى الطالب.`;

  if (cat.includes("تناول الأطعمة") || cat.includes("المشروبات"))
    return `نحيطكم علمًا بأن الطالب/ ${studentName} قام بتناول أطعمة أو مشروبات أثناء الحصة الدراسية دون إذن، وقد تم توجيهه تربويًا.\n\nنأمل التنبيه عليه بالالتزام بمواعيد الاستراحة المخصصة.`;

  // --- الدرجة الرابعة ---
  if (cat.includes("إصابة") || cat.includes("الضرب عمداً"))
    return `نحيطكم علمًا بأن الطالب/ ${studentName} تسبب في إصابة أحد زملائه بالضرب المتعمد اليوم، وهو سلوك خطير يستوجب التدخل الفوري. وقد تم توثيق الحالة واتخاذ الإجراءات النظامية وفق لائحة السلوك والمواظبة.\n\nنأمل مراجعتكم العاجلة للمدرسة لاستكمال ما يلزم.`;

  if (cat.includes("تدخين"))
    return `نحيطكم علمًا بأنه تم ضبط الطالب/ ${studentName} يدخن داخل المحيط المدرسي، وهو سلوك مخالف للأنظمة ويضر بصحته وصحة زملائه. وقد تم توثيق المخالفة واتخاذ الإجراءات المعتمدة.\n\nنأمل مراجعتكم للمدرسة والتعاون في معالجة هذا السلوك حفاظًا على صحة الطالب.`;

  if (cat.includes("مواد إعلامية ممنوعة"))
    return `نحيطكم علمًا بأنه تم ضبط الطالب/ ${studentName} بحوزته مواد إعلامية ممنوعة داخل المدرسة، وقد تم التعامل مع الموقف وتوثيقه وفق لائحة السلوك والمواظبة.\n\nنأمل مراجعتكم للمدرسة لاستكمال الإجراءات اللازمة.`;

  // --- الدرجة الخامسة ---
  if (cat.includes("تحرش"))
    return `نحيطكم علمًا بأنه تم رصد سلوك غير لائق صادر من الطالب/ ${studentName} يستوجب التدخل الفوري، وقد تم توثيق الحالة واتخاذ الإجراءات النظامية العاجلة وفق لائحة السلوك والمواظبة.\n\nنأمل مراجعتكم العاجلة للمدرسة لاستكمال ما يلزم.`;

  if (cat.includes("حرائق") || cat.includes("إشعال"))
    return `نحيطكم علمًا بأن الطالب/ ${studentName} قام بإشعال النار داخل المحيط المدرسي، وهو سلوك بالغ الخطورة يهدد سلامة الجميع. وقد تم توثيق الحالة واتخاذ الإجراءات النظامية الفورية.\n\nنأمل مراجعتكم العاجلة للمدرسة.`;

  if (cat.includes("آلة حادة") || cat.includes("سكاكين"))
    return `نحيطكم علمًا بأنه تم ضبط الطالب/ ${studentName} بحوزته آلة حادة داخل المدرسة، وهو أمر بالغ الخطورة. وقد تم مصادرتها وتوثيق المخالفة واتخاذ الإجراءات النظامية الفورية.\n\nنأمل مراجعتكم العاجلة للمدرسة.`;

  if (cat.includes("مخدرات") || cat.includes("مسكرات"))
    return `نحيطكم علمًا بأنه تم ضبط حالة تتعلق بمواد محظورة شملت الطالب/ ${studentName}، وقد تم توثيقها واتخاذ الإجراءات النظامية الفورية وإبلاغ الجهات المختصة.\n\nنأمل مراجعتكم العاجلة للمدرسة.`;

  if (cat.includes("تنمر") || cat.includes("ابتزاز"))
    return `نحيطكم علمًا بأنه تم رصد سلوك تنمّر صادر من الطالب/ ${studentName} تجاه أحد زملائه، وهو سلوك مرفوض يتعارض مع القيم التربوية. وقد تم توثيق الحالة واتخاذ الإجراءات المعتمدة.\n\nنأمل مراجعتكم للمدرسة والتعاون في تعزيز قيم الاحترام والتعامل الإيجابي لدى الطالب.`;

  if (cat.includes("جرائم معلوماتية"))
    return `نحيطكم علمًا بأن الطالب/ ${studentName} ارتكب مخالفة تتعلق بالجرائم المعلوماتية، وقد تم توثيقها واتخاذ الإجراءات النظامية المعتمدة وإبلاغ الجهات المختصة.\n\nنأمل مراجعتكم العاجلة للمدرسة.`;

  if (cat.includes("شذوذ"))
    return `نحيطكم علمًا بأنه تم رصد سلوك مخالف صادر من الطالب/ ${studentName} يستوجب التدخل الفوري، وقد تم توثيق الحالة واتخاذ الإجراءات النظامية.\n\nنأمل مراجعتكم العاجلة للمدرسة لاستكمال ما يلزم.`;

  // الرسالة العامة الافتراضية - مختصرة وتربوية
  const severityText = degree >= 4 ? "جسيمة" : degree >= 3 ? "مخالفة" : "ملاحظة سلوكية";
  const urgencyText = degree >= 4 ? "نأمل مراجعتكم العاجلة للمدرسة لاستكمال الإجراءات النظامية." : "نأمل تعاونكم في تعزيز السلوك الإيجابي لدى الطالب.";

  return `نحيطكم علمًا بأنه تم رصد ${severityText} بحق الطالب/ ${studentName} تتعلق بـ(${cat})، وقد تم التعامل معها تربويًا وتوثيقها وفق لائحة السلوك والمواظبة.\n\n${urgencyText}`;
};


export const generateWhatsAppMessage = (
  student: Student,
  actionType: ActionType,
  details?: { violationCategory?: string; violationDegree?: number; description?: string },
  senderInfo?: { name?: string; role?: string }
): string => {
  const schoolName = SCHOOL_INFO.school;
  const hijriDate = getFullHijriDate();

  switch (actionType) {
    case "absent":
      return `${hijriDate}\n\nوليّ أمر الطالب/ ${student.name} المحترم\n\nنفيدكم بأن الطالب/ ${student.name} غائب اليوم دون عذر. نأمل إفادتنا بسبب الغياب، مع التأكيد أن قبول العذر يشترط تقديم عذر رسمي معتمد للمدرسة، وإلا يُسجّل الغياب بدون عذر وتُستكمل الإجراءات.${details?.description ? `\n\nملاحظة: ${details.description}` : ""}\n\n\nمع خالص التحية،\n${schoolName}`;

    case "late":
      return `${hijriDate}\n\nوليّ أمر الطالب/ ${student.name} المحترم\n\nنفيدكم بأن الطالب/ ${student.name} تأخر صباحًا اليوم، ونأمل إشعارنا بسبب التأخر، مع التأكيد أن قبول العذر يشترط تقديم عذر رسمي معتمد، وإلا يُوثق التأخر وتُستكمل الإجراءات المعتمدة.${details?.description ? `\n\nملاحظة: ${details.description}` : ""}\n\n\nمع خالص التحية،\n${schoolName}`;

    case "violation": {
      const violationDegree = details?.violationDegree ?? 1;
      const categoryText = details?.violationCategory || "مخالفة سلوكية";
      const violationBody = getViolationMessageBody(categoryText, student.name, violationDegree);
      return `${hijriDate}\n\nوليّ أمر الطالب/ ${student.name} المحترم\n\n${violationBody}${details?.description ? `\n\nملاحظة: ${details.description}` : ""}\n\n\nمع خالص التحية،\n${schoolName} – مسارات`;
    }

    default: {
      // permission, entry, exit, summon — keep a generic format
      const baseHeader = `${hijriDate}\n\nوليّ أمر الطالب/ ${student.name} المحترم\n\nنفيدكم من ${schoolName} بما يلي:`;
      let body = `\nالطالب: ${student.name}\nالمرحلة/الفصل: ${student.grade} - فصل ${student.section}\n`;

      if (actionType === "permission") {
        const now = new Date();
        const hours = now.getHours();
        const minutes = now.getMinutes().toString().padStart(2, "0");
        const period = hours < 12 ? "صباحًا" : "مساءً";
        const h12 = hours % 12 || 12;
        const timeStr = `${h12.toString().padStart(2, "0")}:${minutes} ${period}`;
        return `${hijriDate}\n\nوليّ أمر الطالب/ ${student.name} المحترم\n\nنحيطكم علمًا بأنه تم اليوم اعتماد استئذان الطالب/ ${student.name} عند الساعة (${timeStr})، وقد جرى توثيق الاستئذان في سجل الطالب وفق الإجراءات المعتمدة.${details?.description ? `\n\nملاحظة: ${details.description}` : ""}\n\n\nمع خالص التقدير،\n${schoolName} – مسارات`;
      } else if (actionType === "summon") {
        return `${hijriDate}\n\nوليّ أمر الطالب/ ${student.name} المحترم\n\nحرصًا على مصلحة الطالب وتعزيز الشراكة التربوية بين الأسرة والمدرسة؛ نأمل تفضلكم بمراجعة إدارة المدرسة بشأن الطالب/ ${student.name} (${student.grade} – فصل ${student.section})، وذلك ضمن إجراءات المتابعة المعتمدة بلائحة السلوك والمواظبة.\nنأمل حضوركم في أقرب وقت خلال أوقات الدوام الرسمي لاستكمال ما يلزم.${details?.description ? `\n\nملاحظة: ${details.description}` : ""}\n\nشاكرين تعاونكم وتقديركم،\n${schoolName} – مسارات`;
      } else if (actionType === "entry") {
        const now = new Date();
        const hours = now.getHours();
        const minutes = now.getMinutes().toString().padStart(2, "0");
        const period = hours < 12 ? "صباحًا" : "مساءً";
        const h12 = hours % 12 || 12;
        const timeStr = `${h12.toString().padStart(2, "0")}:${minutes} ${period}`;
        return `${hijriDate}\n\nوليّ أمر الطالب/ ${student.name} المحترم\n\nنحيطكم علمًا بأنه تم السماح للطالب/ ${student.name} بالدخول إلى فصله الدراسي (${student.grade} – فصل ${student.section}) عند الساعة (${timeStr})، وذلك بعد مراجعة إدارة المدرسة واستكمال الإجراءات المعتمدة.${details?.description ? `\n\nملاحظة: ${details.description}` : ""}\n\nمع خالص التحية،\n${schoolName} – مسارات`;
      } else if (actionType === "exit") {
        const now2 = new Date();
        const hours2 = now2.getHours();
        const minutes2 = now2.getMinutes().toString().padStart(2, "0");
        const period2 = hours2 < 12 ? "صباحًا" : "مساءً";
        const h122 = hours2 % 12 || 12;
        const timeStr2 = `${h122.toString().padStart(2, "0")}:${minutes2} ${period2}`;
        return `${hijriDate}\n\nوليّ أمر الطالب/ ${student.name} المحترم\n\nنحيطكم علمًا بأنه تم إخراج الطالب/ ${student.name} (${student.grade} – فصل ${student.section}) من فصله الدراسي عند الساعة (${timeStr2})، وذلك لمراجعة إدارة المدرسة واستكمال إجراء معين وفق الأنظمة المعتمدة.${details?.description ? `\n\nملاحظة: ${details.description}` : ""}\n\nمع خالص التحية،\n${schoolName} – مسارات`;
      }

      if (details?.description) {
        body += `ملاحظة: ${details.description}\n`;
      }

      let footer = `\nمع خالص التحية،\n${schoolName}`;
      if (senderInfo?.name && senderInfo?.role) {
        footer += `\n${senderInfo.role}: ${senderInfo.name}`;
      }

      return `${baseHeader}${body}${footer}`;
    }
  }
};

/**
 * Detect if current device is mobile (phone/tablet).
 */
const isMobileDevice = (): boolean => {
  return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent)
    || (navigator.maxTouchPoints > 0 && window.innerWidth < 1024);
};

/**
 * Open WhatsApp via wa.me only.
 * On desktop/laptop: uses the school's official number (966579812911) via WhatsApp Web.
 * On mobile: uses the user's own WhatsApp number directly.
 * IMPORTANT: never fallback to iframe/same-frame navigation, because WhatsApp blocks framed contexts.
 */
export const openWhatsApp = (phone: string, message: string, _targetWindow?: Window | null): boolean => {
  if (!isValidSaudiPhone(phone)) return false;

  const url = buildWhatsAppUrl(phone, message);

  // Strategy: Use an anchor element with target="_blank" — this is the most reliable
  // cross-browser approach and avoids popup blockers in Chrome/Safari.
  try {
    const a = document.createElement("a");
    a.href = url;
    a.target = "_blank";
    a.rel = "noopener noreferrer";
    a.style.display = "none";
    document.body.appendChild(a);
    a.click();
    // Small delay before cleanup to ensure the click is processed
    setTimeout(() => {
      try { document.body.removeChild(a); } catch {}
    }, 100);
    return true;
  } catch {
    // Fallback: window.open
    try {
      window.open(url, "_blank", "noopener,noreferrer");
      return true;
    } catch {
      // Final fallback: top-level navigation for iframe contexts
      try {
        if (window.top && window.top !== window) {
          window.top.location.href = url;
          return true;
        }
      } catch {}
      return false;
    }
  }
};

/**
 * Check if WhatsApp should use the school's official number
 * Desktop → school official number for formal communication
 * Mobile → user's own number (direct WhatsApp)
 */
export const shouldUseSchoolNumber = (): boolean => {
  return !isMobileDevice();
};

/**
 * Get the appropriate "from" number label for display
 */
export const getWhatsAppSenderLabel = (): string => {
  return shouldUseSchoolNumber() ? `رقم المدرسة الرسمي (${SCHOOL_WHATSAPP_NUMBER})` : "رقمك الشخصي";
};

/**
 * Open WhatsApp for bulk sequential messaging
 * Returns a list of items with phone and message ready to send
 */
export interface BulkMessageItem {
  student: Student;
  phone: string;
  message: string;
}

/**
 * Generate SHORT SMS message that fits in 1 SMS (max 70 Arabic chars).
 * WhatsApp messages remain unchanged (use generateWhatsAppMessage for those).
 */
export const generateSmsMessage = (
  student: Student,
  actionType: ActionType,
  details?: { violationCategory?: string; violationDegree?: number; description?: string },
): string => {
  const name = student.name;
  switch (actionType) {
    case "absent":
      return `ولي أمر ${name}: نفيدكم بغياب الطالب اليوم. نأمل إفادتنا بالسبب. ثانوية اليعقوبي`;
    case "late":
      return `ولي أمر ${name}: نفيدكم بتأخر الطالب صباحاً اليوم. نأمل المتابعة. ثانوية اليعقوبي`;
    case "violation": {
      const cat = details?.violationCategory || "مخالفة سلوكية";
      return `ولي أمر ${name}: تم رصد مخالفة (${cat}). نأمل مراجعة المدرسة. اليعقوبي`;
    }
    case "permission": {
      const now = new Date();
      const h = now.getHours() % 12 || 12;
      const m = now.getMinutes().toString().padStart(2, "0");
      const p = now.getHours() < 12 ? "ص" : "م";
      return `ولي أمر ${name}: تم استئذان الطالب الساعة ${h}:${m}${p}. ثانوية اليعقوبي`;
    }
    case "summon":
      return `ولي أمر ${name}: نأمل مراجعة إدارة ثانوية اليعقوبي بشأن الطالب في أقرب وقت.`;
    case "entry": {
      const now2 = new Date();
      const h2 = now2.getHours() % 12 || 12;
      const m2 = now2.getMinutes().toString().padStart(2, "0");
      const p2 = now2.getHours() < 12 ? "ص" : "م";
      return `ولي أمر ${name}: تم دخول الطالب فصله ${h2}:${m2}${p2}. ثانوية اليعقوبي`;
    }
    case "exit": {
      const now3 = new Date();
      const h3 = now3.getHours() % 12 || 12;
      const m3 = now3.getMinutes().toString().padStart(2, "0");
      const p3 = now3.getHours() < 12 ? "ص" : "م";
      return `ولي أمر ${name}: تم إخراج الطالب من فصله ${h3}:${m3}${p3}. ثانوية اليعقوبي`;
    }
    default:
      return `ولي أمر ${name}: يرجى مراجعة إدارة ثانوية اليعقوبي. شكراً لتعاونكم.`;
  }
};

/**
 * Generate official A4 letter text for WhatsApp sharing
 */
export const generateOfficialLetterWhatsApp = (
  student: Student,
  type: "summon" | "violation" | "pledge",
  senderInfo?: { name?: string; role?: string },
  summonDate?: string
): string => {
  const hijriDate = getFullHijriDate();
  const schoolName = SCHOOL_INFO.school;

  if (type === "summon") {
    return `📄 *خطاب استدعاء ولي أمر*\n${hijriDate}\n\nالمكرم ولي أمر الطالب / *${student.name}*\nالصف / *${student.grade} - فصل ${student.section}*\n\nالسلام عليكم ورحمة الله وبركاته\n\nنظراً لأهمية التعاون بين المدرسة والمنزل، يرجى التكرم بالحضور إلى المدرسة${summonDate ? ` يوم الموافق *${summonDate}*` : ""} في تمام الساعة (09:00 ص) لمقابلة وكيل المدرسة ${SCHOOL_INFO.viceName} لأمر هام يتعلق بابنكم.\n\nشاكرين تعاونكم،\n${schoolName}`;
  }

  if (type === "violation") {
    return `📄 *إشعار مخالفة سلوكية*\n${hijriDate}\n\nولي أمر الطالب / *${student.name}*\n*${student.grade} - فصل ${student.section}*\n\nبناءً على قواعد السلوك والمواظبة المعتمدة من وزارة التعليم، نحيطكم علماً بأنه صدر بحق ابنكم إجراء تربوي.\n\nنأمل التعاون مع إدارة المدرسة لتصحيح سلوك الطالب.\n\nمع التقدير،\n${schoolName}`;
  }

  // pledge
  return `📄 *تعهد خطي*\n${hijriDate}\n\nولي أمر الطالب / *${student.name}*\n*${student.grade} - فصل ${student.section}*\n\nتعهد بعدم تكرار المخالفة والالتزام بأنظمة المدرسة وقواعد السلوك والمواظبة.\n\nيرجى مراجعة المدرسة للتوقيع.\n\nمع التقدير،\n${schoolName}`;
};

export const prepareBulkMessages = (
  students: Student[],
  actionType: ActionType,
  details?: { violationCategory?: string; violationDegree?: number; description?: string },
  senderInfo?: { name?: string; role?: string }
): BulkMessageItem[] => {
  return students
    .filter((s) => s.guardianPhone && s.guardianPhone.trim().length > 0 && isValidSaudiPhone(s.guardianPhone))
    .map((student) => ({
      student,
      phone: formatSaudiPhone(student.guardianPhone),
      message: generateWhatsAppMessage(student, actionType, details, senderInfo),
    }));
};
