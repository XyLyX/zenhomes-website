// netlify/functions/_shared/auth.js
const crypto = require("crypto");

const COOKIE_NAME = "zh_vault_session";

function hmac(message, secret) {
  return crypto.createHmac("sha256", secret).update(message).digest("hex");
}

function timingSafeEqualStr(a, b) {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

/**
 * Verifies the zh_vault_session cookie on an incoming Netlify Function request.
 * Returns true/false. Fails closed on any missing config or malformed cookie.
 */
function isAuthenticated(event) {
  const secret = process.env.VAULT_SECRET;
  if (!secret) return false;

  const cookieHeader = event.headers?.cookie || event.headers?.Cookie;
  if (!cookieHeader) return false;

  const match = cookieHeader.match(new RegExp(`${COOKIE_NAME}=([^;]+)`));
  if (!match) return false;

  const [payloadB64, sig] = match[1].split(".");
  if (!payloadB64 || !sig) return false;

  const expectedSig = hmac(payloadB64, secret);
  if (!timingSafeEqualStr(sig, expectedSig)) return false;

  try {
    const payload = JSON.parse(Buffer.from(payloadB64, "base64").toString("utf-8"));
    return typeof payload.exp === "number" && payload.exp > Date.now();
  } catch {
    return false;
  }
}

function unauthorizedResponse() {
  return {
    statusCode: 401,
    body: JSON.stringify({ error: "Not authenticated. Log in at /vault/ first." }),
  };
}

module.exports = { isAuthenticated, unauthorizedResponse };
