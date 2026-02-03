import express from "express";
import fetch from "node-fetch";
import cors from "cors";

const app = express();
app.use(cors());
app.use(express.json());

/**
 * إعدادات عبر ENV:
 * MADAR_API_BASE=https://app.mobile.net.sa  (أو api.mobile.net.sa حسب التوثيق)
 * MADAR_TOKEN=xxxxx
 * MADAR_SENDER=SchoolName
 */
const MADAR_API_BASE = process.env.MADAR_API_BASE || "https://app.mobile.net.sa";
const MADAR_TOKEN = process.env.MADAR_TOKEN || "";
const MADAR_SENDER = process.env.MADAR_SENDER || "RSD";

/**
 * Endpoint يستدعيه التطبيق:
 * POST /sms/send { to, message }
 */
app.post("/sms/send", async (req, res) => {
  try {
    const { to, message } = req.body || {};
    if(!to || !message) return res.status(400).json({ ok:false, error:"missing to/message" });
    if(!MADAR_TOKEN) return res.status(400).json({ ok:false, error:"MADAR_TOKEN not set" });

    // ⚠️ مثال: عدّل هذا الجزء حسب API الفعلي في حساب المدار التقني
    // بعض المزودين يستخدمون form-data أو querystring أو endpoint مخصص.
    const payload = {
      sender: MADAR_SENDER,
      to,
      message
    };

    const resp = await fetch(`${MADAR_API_BASE}/api/sms/send`, {
      method: "POST",
      headers: {
        "Content-Type":"application/json",
        "Authorization": `Bearer ${MADAR_TOKEN}`
      },
      body: JSON.stringify(payload)
    });

    const data = await resp.json().catch(()=> ({}));
    if(!resp.ok) {
      return res.status(400).json({ ok:false, error: data?.message || "madar api error", raw:data });
    }
    return res.json({ ok:true, data });

  } catch (e) {
    return res.status(500).json({ ok:false, error: e.message });
  }
});

app.listen(3000, ()=> console.log("SMS Bridge running: http://localhost:3000"));
