// netlify/functions/vault-share.js
const { vaultStore } = require("./_shared/store");
const crypto = require("crypto");
const { isAuthenticated, unauthorizedResponse } = require("./_shared/auth");

const SHARE_DAYS_DEFAULT = 30;

exports.handler = async (event) => {
  if (!isAuthenticated(event)) return unauthorizedResponse();
  if (event.httpMethod !== "POST") return { statusCode: 405, body: "Method not allowed" };

  let payload;
  try {
    payload = JSON.parse(event.body);
  } catch {
    return { statusCode: 400, body: JSON.stringify({ error: "Invalid request body" }) };
  }

  const { id, action, days } = payload; // action: "create" | "revoke"
  if (!id) return { statusCode: 400, body: JSON.stringify({ error: "Missing id" }) };

  const metaStore = vaultStore("zh-vault-meta");
  const manifest = (await metaStore.get("manifest", { type: "json" })) || { documents: [] };
  const doc = manifest.documents.find((d) => d.id === id);
  if (!doc) return { statusCode: 404, body: JSON.stringify({ error: "Document not found" }) };

  if (action === "revoke") {
    delete doc.shareToken;
    delete doc.shareExpires;
    await metaStore.setJSON("manifest", manifest);
    return { statusCode: 200, body: JSON.stringify({ revoked: true }) };
  }

  // default action: create (or refresh) a share link
  const token = crypto.randomBytes(24).toString("base64url");
  const expireDays = Number(days) > 0 ? Number(days) : SHARE_DAYS_DEFAULT;
  doc.shareToken = token;
  doc.shareExpires = Date.now() + expireDays * 24 * 60 * 60 * 1000;
  await metaStore.setJSON("manifest", manifest);

  return {
    statusCode: 200,
    body: JSON.stringify({
      shareUrl: `/vault/shared/${token}`,
      expiresAt: doc.shareExpires,
    }),
  };
};
