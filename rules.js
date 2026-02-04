// rules.js - configurable rule helpers (basic defaults aligned with school practice)
export const DEFAULTS = {
  behaviorLevels: [
    { level: 1, title: "مخالفة بسيطة", points: 1 },
    { level: 2, title: "مخالفة متوسطة", points: 2 },
    { level: 3, title: "مخالفة عالية", points: 3 },
    { level: 4, title: "مخالفة جسيمة", points: 10 },
    { level: 5, title: "مخالفة شديدة الجسامة", points: 15 }
  ],
  attendanceTypes: [
    { key: "absent", title: "غياب" },
    { key: "late", title: "تأخر" },
    { key: "early", title: "انصراف مبكر" }
  ],
  // message templates (can be edited from settings)
  templates: {
    absent: "نفيدكم بغياب الطالب/ {name} ({class}) بتاريخ {date}. نأمل متابعة سبب الغياب وتزويد المدرسة بما يلزم.",
    late: "نفيدكم بتأخر الطالب/ {name} ({class}) بتاريخ {date} لمدة {minutes} دقيقة. نأمل الالتزام بوقت الدوام.",
    behavior: "نفيدكم برصد مخالفة سلوكية للطالب/ {name} ({class}) بتاريخ {date}: {behavior}. نأمل التعاون مع المدرسة في معالجة السلوك.",
    custom: "{text}"
  }
};

export function formatDate(arISO){
  // expects YYYY-MM-DD
  if(!arISO) return "";
  const [y,m,d] = String(arISO).split("-");
  return `${d}/${m}/${y}`;
}

export function fillTemplate(tpl, vars){
  let out = String(tpl||"");
  for(const [k,v] of Object.entries(vars||{})){
    out = out.replaceAll(`{${k}}`, String(v ?? ""));
  }
  return out;
}

export function pointsForLevel(level, cfg){
  const arr = (cfg?.behaviorLevels || DEFAULTS.behaviorLevels);
  const item = arr.find(x=>Number(x.level)===Number(level));
  return item ? Number(item.points)||0 : 0;
}
