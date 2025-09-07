// netlify/functions/submit.js
// Robust parsing + ordered Chinese labels + JSON responses
// Env vars required: BREVO_API_KEY, TO_EMAIL, FROM_EMAIL
// Optional: SITE_NAME

export default async (req, context) => {
  try {
    if (req.method !== "POST") {
      return new Response(JSON.stringify({ error: "Method Not Allowed" }), {
        status: 405,
        headers: { "content-type": "application/json; charset=utf-8" },
      });
    }

    // ---- Parse body safely (JSON / urlencoded / multipart) ----
    const ct = (req.headers.get("content-type") || "").toLowerCase();
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
    } catch {
      const text = await req.text().catch(() => "");
      try { data = JSON.parse(text || "{}"); }
      catch { data = Object.fromEntries(new URLSearchParams(text)); }
    }

    // ---- Env & subject ----
    const siteName = process.env.SITE_NAME || "顧客滿意度調查";
    const toEmail  = process.env.TO_EMAIL;
    const fromEmail= process.env.FROM_EMAIL;
    const apiKey   = process.env.BREVO_API_KEY;

    if (!apiKey || !toEmail || !fromEmail) {
      return new Response(JSON.stringify({
        error: "Missing environment variables. Please configure BREVO_API_KEY, TO_EMAIL, FROM_EMAIL."
      }), { status: 500, headers: { "content-type": "application/json; charset=utf-8" } });
    }

    const customerName =
      data.customer_name || data.name || data.line || data["姓名"] || "";
    // 👉 主旨改為固定「【服務滿意度】」
    const subject = `【服務滿意度】新問卷回覆：${customerName || "未填姓名"}`;

    // ---- Label map (Chinese) & output order ----
    const labelMap = {
      customer_name: "姓名/LINE",
      q1: "服務滿意度",
      q2: "專業程度",
      q2_extra: "專業程度備註",
      q3: "服務人員表現 (1-5)",
      q4: "推薦度 (1-10)",
      q5: "是否再次委託",
      q6: "其他建議",
    };

    const skipKeys = new Set([
      "bot-field","form-name","g-recaptcha-response","submit","userAgent","submittedAt",
    ]);

    // 先依 labelMap 的順序輸出
    let orderedPairs = Object.keys(labelMap)
      .filter((k) => k in data)
      .map((k) => [k, data[k]]);
    // 再補上未列於 labelMap 的欄位
    for (const [k, v] of Object.entries(data)) {
      if (skipKeys.has(k)) continue;
      if (!(k in labelMap) && !orderedPairs.some(([ok]) => ok === k)) {
        orderedPairs.push([k, v]);
      }
    }

    const rows = orderedPairs
      .filter(([k]) => !skipKeys.has(k))
      .map(([k, v]) => {
        const key = labelMap[k] || k;
        const val = Array.isArray(v) ? v.join(", ") : String(v ?? "");
        return `<tr><th align="left" style="white-space:nowrap">${escapeHtml(key)}</th><td>${escapeHtml(val).replace(/\n/g,"<br/>") || "(未填)"}</td></tr>`;
      })
      .join("\n");

    const submittedAt = data.submittedAt || new Date().toISOString();
    const userAgent = data.userAgent || "";

    const htmlContent = `
      <div style="font-family:Arial,Helvetica,sans-serif;line-height:1.6">
        <h2>${escapeHtml(subject)}</h2>
        <table border="1" cellpadding="8" cellspacing="0" style="border-collapse:collapse;width:100%;max-width:760px">
          ${rows || '<tr><td>(沒有欄位資料)</td></tr>'}
          <tr><th align="left">送出時間</th><td>${escapeHtml(submittedAt)}</td></tr>
          <tr><th align="left">User-Agent</th><td>${escapeHtml(userAgent)}</td></tr>
        </table>
        <pre style="margin-top:12px;background:#f6f8fa;padding:12px;border-radius:6px;overflow:auto">${escapeHtml(JSON.stringify(data, null, 2))}</pre>
      </div>
    `;

    // ---- Send via Brevo SMTP API ----
    const res = await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: {
        "api-key": apiKey,
        accept: "application/json",
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
      const errText = await res.text().catch(() => "");
      return new Response(JSON.stringify({ error: "Brevo API error", details: errText }), {
        status: 502,
        headers: { "content-type": "application/json; charset=utf-8" },
      });
    }

    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: {
        "content-type": "application/json; charset=utf-8",
        "cache-control": "no-store",
      },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { "content-type": "application/json; charset=utf-8" },
    });
  }
};

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
