import { uid, put, all, del, getSetting } from "./db.js";

export async function queueSms(db, { to, body, meta={} }){
  const item = {
    id: uid("sms"),
    createdAt: new Date().toISOString(),
    to,
    body,
    meta,
    status: "queued",
    lastError: ""
  };
  await put(db, "sms_queue", item);
  return item;
}

export async function sendSmsViaEndpoint(endpoint, to, body){
  const resp = await fetch(endpoint, {
    method:"POST",
    headers:{ "Content-Type":"application/json" },
    body: JSON.stringify({ to, message: body })
  });
  const out = await resp.json().catch(()=>({}));
  if(!resp.ok || out.ok === false){
    throw new Error(out.error || "SMS failed");
  }
  return out;
}

export async function flushSmsQueue(db){
  const endpoint = await getSetting(db, "smsEndpoint", "");
  if(!endpoint) return { sent:0, failed:0, note:"لم يتم ضبط SMS Endpoint" };

  const items = await all(db, "sms_queue");
  let sent=0, failed=0;

  for(const item of items){
    if(item.status === "sent") continue;
    try{
      await sendSmsViaEndpoint(endpoint, item.to, item.body);
      item.status = "sent";
      item.lastError = "";
      await put(db, "sms_queue", item);
      sent++;
    }catch(e){
      item.status = "failed";
      item.lastError = String(e?.message || e);
      await put(db, "sms_queue", item);
      failed++;
    }
  }
  return { sent, failed };
}

export async function removeSms(db, id){
  await del(db, "sms_queue", id);
}
