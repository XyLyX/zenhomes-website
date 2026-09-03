// netlify/functions/mandate-notion-sync.js
//
// Turns a contact-form submission into a structured record in the "Zen Homes —
// Mandates" Notion database, so an adviser opens a one-page brief instead of a
// raw enquiry email.
//
// Netlify Forms already captures every submission natively (visible in the
// Netlify dashboard) — this function doesn't replace that, it just mirrors
// the "contact" form's submissions into Notion for triage. It's wired up as
// an outgoing webhook, NOT called directly by the browser:
//
//   Netlify dashboard → Site configuration → Forms → Form notifications
//   → Add notification → Outgoing webhook
//     Form: contact
//     URL:  https://zenhomesglobal.com/.netlify/functions/mandate-notion-sync
//
// Requires two environment variables (Site configuration → Environment
// variables), from a Notion internal integration that has been shared with
// the "Zen Homes — Mandates" database:
//   NOTION_API_KEY       — the integration's internal secret
//   NOTION_DATABASE_ID   — 82f1650d42fa455b876177068136668d
//
// Netlify's outgoing-webhook payload shape: { payload: { form_name, data, created_at, ... } }
// docs: https://docs.netlify.com/forms/notifications/#outgoing-webhooks

const NOTION_VERSION = "2022-06-28";

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }

  const apiKey = process.env.NOTION_API_KEY;
  const databaseId = process.env.NOTION_DATABASE_ID;
  if (!apiKey || !databaseId) {
    console.error("mandate-notion-sync: missing NOTION_API_KEY or NOTION_DATABASE_ID");
    // Return 200 so Netlify doesn't treat this as a failed delivery it needs
    // to retry — the submission itself is already safe in Netlify Forms.
    return { statusCode: 200, body: "Notion sync not configured; submission left in Netlify Forms only." };
  }

  let payload;
  try {
    payload = JSON.parse(event.body || "{}").payload;
  } catch (err) {
    return { statusCode: 400, body: "Invalid JSON" };
  }
  if (!payload || !payload.data) {
    return { statusCode: 400, body: "Missing form payload" };
  }

  // Only the mandate intake form — ignore the newsletter form or anything else
  // that might one day point notifications at this same function.
  if (payload.form_name && payload.form_name !== "contact") {
    return { statusCode: 200, body: "Ignored — not the contact form." };
  }

  const data = payload.data;

  // Honeypot check — belt-and-braces alongside Netlify's own spam filtering.
  if (data["bot-field"]) {
    return { statusCode: 200, body: "Ignored — honeypot triggered." };
  }

  const select = (value) => (value ? { select: { name: value } } : undefined);
  const richText = (value) => (value ? { rich_text: [{ text: { content: String(value).slice(0, 2000) } }] } : { rich_text: [] });

  const properties = {
    Name: { title: [{ text: { content: data.name || "New Enquiry" } }] },
    Status: { select: { name: "New" } },
    Objective: select(data.objective),
    "Portfolio Size": select(data.portfolio_size),
    "Investment Range": select(data.investment_range),
    "Target Return": select(data.target_return),
    "Hold Period": select(data.hold_period),
    "Liquidity Timeframe": select(data.liquidity_timeframe),
    "Area of Interest": select(data.interest),
    "Property Category": select(data.property_category),
    Email: data.email ? { email: data.email } : undefined,
    Phone: data.phone ? { phone_number: data.phone } : undefined,
    Company: richText(data.company),
    Notes: richText(data.message),
    "Source Page": { url: "https://zenhomesglobal.com/contact" },
    Submitted: { date: { start: payload.created_at || new Date().toISOString() } },
  };

  // Drop any property left undefined (Notion rejects unset keys, not missing ones).
  Object.keys(properties).forEach((key) => properties[key] === undefined && delete properties[key]);

  try {
    const res = await fetch("https://api.notion.com/v1/pages", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Notion-Version": NOTION_VERSION,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        parent: { database_id: databaseId },
        properties,
      }),
    });

    if (!res.ok) {
      const errBody = await res.text();
      console.error("mandate-notion-sync: Notion API error", res.status, errBody);
      // Still 200 — the enquiry is safe in Netlify Forms even if Notion sync failed.
      return { statusCode: 200, body: "Submission recorded; Notion sync failed, see function logs." };
    }

    return { statusCode: 200, body: "Synced to Notion." };
  } catch (err) {
    console.error("mandate-notion-sync: unexpected error", err);
    return { statusCode: 200, body: "Submission recorded; Notion sync failed, see function logs." };
  }
};
