// Netlify Function: submit.js (robust parser + dynamic email rows)
// Env vars required: BREVO_API_KEY, TO_EMAIL, FROM_EMAIL
// Optional: SITE_NAME

export default async (req, context) => {
  try {
    if (req.method !== "POST") {
      return new Response(JSON.stringify({ error: "Method Not Allowed" }), {
        status: 405,
        headers: { "content-type": "application/json" },
      });
    }

    const ct = req.headers.get("content-type") || "";
    let data = {};
    try {
      if (ct.includes("application/json")) {
        data = await req.json();
      } else if (ct.includes("application/x-www-form-urlencoded")) {
        const text = await req.text();
        data = Object.fromEntries(new URLSearchParams(text));
      } else if (ct.includes("multipart/form-data")) {
        const form = await req.formData();
        data = Object.fromEntries(Array.from(form.entries()));
      } else {
        const text = await req.text();
        try { data = JSON.parse(text || "{}"); }
        catch { data = Object.fromEntries(new URLSearchParams(text)); }
      }
    } catch (e) {
      const text = await req.text().catch(() => "");
      try { data = JSON.parse(text || "{}"); }
      catch { data = Object.fromEntries(new URLSearchParams(text)); }
    }

    const siteName = process.env.SITE_NAME || "顧客滿意度調查";
    const toEmail  = process.env.TO_EMAIL;
    const fromEmail= process.env.FROM_EMAIL;
    const apiKey   = process.env.BREVO_API_KEY;

    if (!apiKey || !toEmail || !fromEmail) {
      return new Response(JSON.stringify({
        error: "Missing environment variables. Please configure BREVO_API_KEY, TO_EMAIL, FROM_EMAIL."
      }), { status: 500, headers: { "content-type": "application/json" } });
    }

    const customerName = data.customer_name || data.name || data.line || data["姓名"] || "";
    const subject = `【${siteName}】新問卷回覆：${customerName || "未填姓名"}`;

    // 動態生成表格
    const skipKeys = new Set(["bot-field","form-name","g-recaptcha-response","submit","userAgent","submittedAt"]);
    const rows = Object.entries(data)
      .filter(([k,v]) => !skipKeys.has(k))
      .map(([k,v]) => {
        const key = String(k);
        const val = Array.isArray(v) ? v.join(", ") : String(v ?? "");
        return `<tr><th align="left" style="white-space:nowrap">${key}</th><td>${val.replace(/\n/g,"<br/>") || "(未填)"}</td></tr>`;
      })
      .join("\n");

    const htmlContent = `
      <div style="font-family:Arial,Helvetica,sans-serif;line-height:1.6">
        <h2>${subject}</h2>
        <table border="1" cellpadding="8" cellspacing="0" style="border-collapse:collapse">
          ${rows || '<tr><td>(沒有欄位資料)</td></tr>'}
          <tr><th align="left">送出時間</th><td>${data.submittedAt || new Date().toISOString()}</td></tr>
          <tr><th align="left">User-Agent</th><td>${data.userAgent || ""}</td></tr>
        </table>
        <pre style="margin-top:12px;background:#f6f8fa;padding:12px;border-radius:6px;overflow:auto">${JSON.stringify(data, null, 2)}</pre>
      </div>
    `;

    const res = await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: {
        "api-key": apiKey,
        "accept": "application/json",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        sender: { email: fromEmail, name: siteName },
        to: [{ email: toEmail }],
        subject,
        htmlContent,
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      return new Response(JSON.stringify({ error: "Brevo API error", details: errText }), {
        status: 502,
        headers: { "content-type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { "content-type": "application/json" },
    });
  }
};
