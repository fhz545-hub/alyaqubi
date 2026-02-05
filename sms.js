(function(){
  async function getSettings(){
    const url = (await DB.getMeta("sms_proxy_url")) || "";
    const key = (await DB.getMeta("sms_proxy_key")) || "";
    return {url, key};
  }

  async function send(to, message){
    const {url, key} = await getSettings();
    if(!url) throw new Error("لم يتم ضبط رابط وسيط الرسائل (Proxy).");
    if(!key) throw new Error("لم يتم ضبط مفتاح الحماية (Proxy Key).");
    const res = await fetch(url.replace(/\/$/,"") + "/send", {
      method:"POST",
      headers:{
        "content-type":"application/json",
        "x-proxy-key": key
      },
      body: JSON.stringify({to, message})
    });
    const txt = await res.text();
    let data=null;
    try{ data=JSON.parse(txt); }catch(e){}
    if(!res.ok){
      const msg = (data && (data.error||data.message)) || txt || ("HTTP "+res.status);
      throw new Error(msg);
    }
    return data || {ok:true};
  }

  window.SMS = { send };
})();
