export const DEFAULT_RULES = {
  version: 1,
  attendance: {
    types: [
      { code:"LATE",  label:"تأخر صباحي", defaultActions:["CALL_PARENT","COUNSEL_SESSION"] },
      { code:"ABSENT",label:"غياب",       defaultActions:["CALL_PARENT","LETTER"] }
    ]
  },
  behavior: {
    infractions: [
      { code:"B001", label:"مخالفة سلوكية (يتم ضبطها حسب الدليل)", severity:"low", defaultActions:["COUNSEL_SESSION","CALL_PARENT"], requiresApproval:false },
      { code:"B002", label:"مخالفة سلوكية متوسطة (تعدل حسب الدليل)", severity:"medium", defaultActions:["COUNSEL_SESSION","LETTER"], requiresApproval:true },
      { code:"B003", label:"مخالفة سلوكية عالية (تعدل حسب الدليل)", severity:"high", defaultActions:["LETTER"], requiresApproval:true }
    ],
    actionsCatalog: [
      { code:"CALL_PARENT", label:"التواصل مع ولي الأمر" },
      { code:"COUNSEL_SESSION", label:"جلسة إرشادية" },
      { code:"LETTER", label:"إشعار/خطاب" }
    ]
  },
  smsTemplates: {
    late:   "نفيدكم بتأخر الطالب {name} بتاريخ {date}، ونأمل متابعة الالتزام بالدوام.",
    absent: "نفيدكم بغياب الطالب {name} بتاريخ {date}، ونأمل تزويد المدرسة بالعذر النظامي عند الحاجة.",
    behavior:"نفيدكم بوجود ملاحظة سلوكية على الطالب {name} بتاريخ {date}، وسيتم اتخاذ الإجراء التربوي المناسب وفق الأنظمة."
  }
};

export function renderTemplate(tpl, vars){
  return (tpl || "").replace(/\{(\w+)\}/g, (_,k)=> (vars[k] ?? ""));
}

export function getAttendanceType(rules, code){
  return rules?.attendance?.types?.find(x=>x.code===code) || null;
}

export function getBehaviorItem(rules, code){
  return rules?.behavior?.infractions?.find(x=>x.code===code) || null;
}

export function suggestAttendance(rules, { typeCode, minutes=0 }){
  const t = getAttendanceType(rules, typeCode);
  if(!t) return { actions:[], text:"—" };

  // مثال بسيط: إذا التأخر كبير اقترح إشعار أقوى (يمكن تخصيصه)
  const actions = [...(t.defaultActions || [])];
  if(typeCode==="LATE" && Number(minutes) >= 30 && !actions.includes("LETTER")) actions.push("LETTER");

  return { actions, text: actionsToText(rules, actions) };
}

export function suggestBehavior(rules, { code, severity }){
  const item = getBehaviorItem(rules, code);
  if(!item) return { actions:[], text:"—", requiresApproval:false };

  const actions = [...(item.defaultActions || [])];
  // يمكن التوسعة: عند high أضف LETTER دائمًا
  if((severity==="high" || item.severity==="high") && !actions.includes("LETTER")) actions.push("LETTER");

  return { actions, text: actionsToText(rules, actions), requiresApproval: !!item.requiresApproval };
}

export function actionsToText(rules, actions){
  const cat = rules?.behavior?.actionsCatalog || [];
  const labels = actions.map(a=>cat.find(x=>x.code===a)?.label || a);
  return labels.join("، ");
}
