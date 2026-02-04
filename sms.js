// ضع رابط الـ Worker هنا:
const SMS_PROXY_BASE = "https://<اسمك>.workers.dev";

// المفتاح الذي وضعته في APP_KEY داخل Cloudflare (لا تخزنه في GitHub)
// الأفضل: تخليه يُكتب مرة من المدير داخل التطبيق ثم تحفظه localStorage
function getAppKey(){
  return localStorage.getItem("YAQUBI_APP_KEY") || "";
}

export async function sendSMS({ number, senderName, messageBody, sendAtOption="NOW", allow_duplicate=false }) {
  const res = await fetch(`${SMS_PROXY_BASE}/send`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-App-Key": getAppKey(),
    },
    body: JSON.stringify({ number, senderName, sendAtOption, messageBody, allow_duplicate }),
  });
  return await res.json();
}

export async function sendBulkSMS({ numbers, senderName, messageBody, sendAtOption="NOW" }) {
  const res = await fetch(`${SMS_PROXY_BASE}/send-bulk`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-App-Key": getAppKey(),
    },
    body: JSON.stringify({ numbers, senderName, sendAtOption, messageBody }),
  });
  return await res.json();
}
