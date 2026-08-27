// netlify/edge-functions/vault-gate.js
//
// Gates access to /vault/ behind a single shared password (not per-user auth —
// this is intentional, per the site owner's requirement: one person, one password).
//
// Requires two environment variables set in Netlify's dashboard
// (Site configuration > Environment variables) — never committed to code:
//   VAULT_PASSWORD  — the password you'll type in to unlock the vault
//   VAULT_SECRET    — a long random string used to sign session cookies
//                     (e.g. run `openssl rand -hex 32` locally to generate one)
//
// If either is missing, this fails CLOSED (blocks access) rather than open.

const COOKIE_NAME = "zh_vault_session";
// This is deliberately a browser-SESSION cookie (no Max-Age/Expires below),
// so it's cleared automatically when the browser is fully closed. The exp
// timestamp inside the payload is a secondary, shorter safety cap — in case
// someone leaves a tab open indefinitely — not the primary logout mechanism.
const SESSION_MAX_HOURS = 4;

async function hmac(message, secret) {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(message));
  return Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2, "0")).join("");
}

async function sha256(text) {
  const enc = new TextEncoder();
  const digest = await crypto.subtle.digest("SHA-256", enc.encode(text));
  return Array.from(new Uint8Array(digest)).map(b => b.toString(16).padStart(2, "0")).join("");
}

function timingSafeEqual(a, b) {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return result === 0;
}

async function makeSessionCookie(secret) {
  const payload = JSON.stringify({ exp: Date.now() + SESSION_MAX_HOURS * 60 * 60 * 1000 });
  const payloadB64 = btoa(payload);
  const sig = await hmac(payloadB64, secret);
  const value = `${payloadB64}.${sig}`;
  // No Max-Age / Expires attribute: this makes it a true session cookie,
  // deleted by the browser when it's fully closed (not just the tab).
  return `${COOKIE_NAME}=${value}; Path=/; HttpOnly; Secure; SameSite=Strict`;
}

function clearedSessionCookie() {
  return `${COOKIE_NAME}=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0`;
}

async function isValidSession(cookieHeader, secret) {
  if (!cookieHeader) return false;
  const match = cookieHeader.match(new RegExp(`${COOKIE_NAME}=([^;]+)`));
  if (!match) return false;
  const [payloadB64, sig] = match[1].split(".");
  if (!payloadB64 || !sig) return false;
  const expectedSig = await hmac(payloadB64, secret);
  if (!timingSafeEqual(sig, expectedSig)) return false;
  try {
    const payload = JSON.parse(atob(payloadB64));
    return typeof payload.exp === "number" && payload.exp > Date.now();
  } catch {
    return false;
  }
}

function loginPage({ error } = {}) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Vault | Zen Homes</title>
<link href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;700&family=Inter:wght@400;500&display=swap" rel="stylesheet">
<style>
  *{box-sizing:border-box;margin:0;padding:0;}
  body{
    font-family:'Inter',sans-serif; background:#FAF9F6; color:#121212;
    min-height:100vh; display:flex; align-items:center; justify-content:center;
  }
  .card{ max-width:380px; width:90%; text-align:center; }
  .wordmark{ font-family:'Space Grotesk',sans-serif; font-weight:500; font-size:20px; margin-bottom:8px; }
  .wordmark span{ color:#00CED1; }
  .eyebrow{
    font-family:monospace; font-size:11px; letter-spacing:.18em; text-transform:uppercase;
    color:#00A5A8; margin-bottom:36px; display:block;
  }
  h1{ font-family:'Space Grotesk',sans-serif; font-weight:500; font-size:26px; margin-bottom:28px; }
  form{ display:flex; flex-direction:column; gap:16px; }
  input[type=password]{
    background:transparent; border:1px solid #D8D8D0; border-bottom:1px solid #00CED1;
    padding:12px 4px; color:#121212; font-size:15px; font-family:'Inter',sans-serif;
  }
  input[type=password]:focus{ outline:none; border-color:#00CED1; }
  button{
    padding:14px; background:#00CED1; color:#FFFFFF; border:none; font-size:12.5px;
    letter-spacing:.1em; text-transform:uppercase; cursor:pointer; margin-top:8px; border-radius:4px;
  }
  button:hover{ background:#00A5A8; }
  .error{ color:#C0392B; font-size:13px; margin-top:-6px; }
  a.back{ color:#6B6B65; font-size:12.5px; text-decoration:none; display:inline-block; margin-top:28px; }
</style>
</head>
<body>
  <div class="card">
    <div class="wordmark">ZEN <span>HOMES</span></div>
    <span class="eyebrow">Private Vault</span>
    <h1>Enter your password</h1>
    <form method="POST">
      <input type="password" name="password" placeholder="Password" required autofocus>
      ${error ? `<div class="error">${error}</div>` : ""}
      <button type="submit">Unlock</button>
    </form>
    <a class="back" href="/">← Back to zenhomesglobal.com</a>
  </div>
</body>
</html>`;
}

function notConfiguredPage() {
  return `<!DOCTYPE html><html><body style="font-family:sans-serif;background:#FAF9F6;color:#121212;padding:60px;text-align:center;">
  <h2>This page is not yet configured.</h2>
  <p>The site owner needs to set the VAULT_PASSWORD and VAULT_SECRET environment variables in Netlify.</p>
  </body></html>`;
}

export default async (request, context) => {
  const url = new URL(request.url);

  // Client-facing shared links live at /vault/shared/* and are deliberately
  // NOT password-gated — that's the whole point of a share link.
  if (url.pathname.startsWith("/vault/shared/")) {
    return context.next();
  }

  if (url.pathname === "/vault/logout") {
    // POST: fired automatically (via navigator.sendBeacon) the moment someone
    // navigates away from /vault/ to elsewhere on the site, or closes the tab.
    // No redirect — the page is already unloading, so just clear the cookie.
    if (request.method === "POST") {
      return new Response(null, { status: 204, headers: { "Set-Cookie": clearedSessionCookie() } });
    }
    // GET: the manual "Log Out" link in the vault nav.
    return new Response(null, {
      status: 303,
      headers: { "Location": "/", "Set-Cookie": clearedSessionCookie() },
    });
  }

  const VAULT_PASSWORD = Netlify.env.get("VAULT_PASSWORD");
  const VAULT_SECRET = Netlify.env.get("VAULT_SECRET");

  if (!VAULT_PASSWORD || !VAULT_SECRET) {
    return new Response(notConfiguredPage(), { status: 503, headers: { "Content-Type": "text/html" } });
  }

  // Handle login submission
  if (request.method === "POST") {
    const form = await request.formData();
    const submitted = String(form.get("password") || "");
    const submittedHash = await sha256(submitted);
    const realHash = await sha256(VAULT_PASSWORD);

    if (timingSafeEqual(submittedHash, realHash)) {
      const cookie = await makeSessionCookie(VAULT_SECRET);
      return new Response(null, {
        status: 303,
        headers: { "Location": "/vault/", "Set-Cookie": cookie },
      });
    }
    return new Response(loginPage({ error: "Incorrect password. Try again." }), {
      status: 401,
      headers: { "Content-Type": "text/html" },
    });
  }

  // Check existing session
  const cookieHeader = request.headers.get("cookie");
  const valid = await isValidSession(cookieHeader, VAULT_SECRET);

  if (valid) {
    return context.next();
  }

  return new Response(loginPage(), { status: 401, headers: { "Content-Type": "text/html" } });
};

export const config = { path: "/vault/*" };
