// Netlify Function: submit.js
// Sends a transactional email via Brevo (Sendinblue) with the survey submission.
// Required environment variables in Netlify:
//   BREVO_API_KEY -> https://app.brevo.com/settings/keys/smtp
//   TO_EMAIL      -> where to send notifications (e.g. owner@example.com)
//   FROM_EMAIL    -> a verified sender in Brevo (e.g. no-reply@yourdomain.com)
//   SITE_NAME     -> optional, used in the email subject

export default async (req, context) => {
  try {
    if (req.method !== "POST") {
      return new Response(JSON.stringify({ error: "Method Not Allowed" }), {
        status: 405,
        headers: { "content-type": "application/json" },
      });
    }

    const bodyText = await req.text();
    let data = {};
    const contentType = req.headers.get("content-type") || "";
    if (contentType.includes("application/json")) {
      data = JSON.parse(bodyText || "{}");
    } else if (contentType.includes("application/x-www-form-urlencoded")) {
      data = Object.fromEntries(new URLSearchParams(bodyText));
    } else if (contentType.includes("multipart/form-data")) {
      // Netlify automatically parses multipart via formData() on the Request in some runtimes,
      // but in standard Fetch we can read it as formData() only in Edge functions.
      // As a fallback, attempt URLSearchParams parse:
      data = Object.fromEntries(new URLSearchParams(bodyText));
    } else {
      // Try parse as querystring anyway
      data = Object.fromEntries(new URLSearchParams(bodyText));
    }

    const {
      customer_name = "",
      q1 = "",
      q2 = "",
      q2_extra = "",
      q3 = "",
      q4 = "",
      q5 = "",
      q6 = "",
      userAgent = "",
      submittedAt = new Date().toISOString(),
    } = data;

    const siteName = process.env.SITE_NAME || "顧客滿意度調查";
    const toEmail  = process.env.TO_EMAIL;
    const fromEmail= process.env.FROM_EMAIL;
    const apiKey   = process.env.BREVO_API_KEY;

    if (!apiKey || !toEmail || !fromEmail) {
      return new Response(JSON.stringify({
        error: "Missing environment variables. Please configure BREVO_API_KEY, TO_EMAIL, FROM_EMAIL."
      }), { status: 500, headers: { "content-type": "application/json" } });
    }

    const subject = `【${siteName}】新問卷回覆：${customer_name || "未填姓名"}`;

    const htmlContent = `
      <div style="font-family:Arial,Helvetica,sans-serif;line-height:1.6">
        <h2>${subject}</h2>
        <table border="1" cellpadding="8" cellspacing="0" style="border-collapse:collapse">
          <tr><th align="left">姓名/LINE</th><td>${customer_name || "(未填)"}</td></tr>
          <tr><th align="left">Q1. 服務滿意度</th><td>${q1 || "(未填)"}</td></tr>
          <tr><th align="left">Q2. 清潔品質</th><td>${q2 || "(未填)"}<br/>備註：${q2_extra || "(無)"}</td></tr>
          <tr><th align="left">Q3. 技師專業度 (1-5)</th><td>${q3 || "(未填)"}</td></tr>
          <tr><th align="left">Q4. 價格合理度 (1-10)</th><td>${q4 || "(未填)"}</td></tr>
          <tr><th align="left">Q5. 會否推薦</th><td>${q5 || "(未填)"}</td></tr>
          <tr><th align="left">Q6. 其他建議</th><td>${(q6 || "(無)").replace(/\n/g, "<br/>")}</td></tr>
          <tr><th align="left">送出時間</th><td>${submittedAt}</td></tr>
          <tr><th align="left">User-Agent</th><td>${userAgent || ""}</td></tr>
        </table>
      </div>
    `;

    // Brevo SMTP API
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
        // You could also set a reply-to to the customer if you collect their email
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
      headers: {
        "content-type": "application/json",
        "cache-control": "no-store",
      },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { "content-type": "application/json" },
    });
  }
};
