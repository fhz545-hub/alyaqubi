export async function sendSMS({proxyUrl, proxyKey, number, senderName, messageBody, allowDuplicate=false, sendAtOption="NOW"}) {
  if(!proxyUrl) throw new Error("لم يتم ضبط رابط الوسيط (Proxy URL)");
  if(!proxyKey) throw new Error("لم يتم ضبط مفتاح الحماية (Proxy Key)");
  const url = proxyUrl.replace(/\/+$/,'') + "/send";
  const res = await fetch(url, {
    method:"POST",
    headers:{
      "Content-Type":"application/json",
      "Accept":"application/json",
      "X-Proxy-Key": proxyKey
    },
    body: JSON.stringify({
      number,
      senderName,
      sendAtOption,
      messageBody,
      allow_duplicate: !!allowDuplicate
    })
  });
  const data = await res.json().catch(()=> ({}));
  if(!res.ok || data?.status?.toLowerCase?.() === "failed"){
    const msg = data?.message || ("تعذر الإرسال (HTTP "+res.status+")");
    throw new Error(msg);
  }
  return data;
}
