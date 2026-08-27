// netlify/functions/vault-delete.js
const { vaultStore } = require("./_shared/store");
const { isAuthenticated, unauthorizedResponse } = require("./_shared/auth");

exports.handler = async (event) => {
  if (!isAuthenticated(event)) return unauthorizedResponse();
  if (event.httpMethod !== "POST") return { statusCode: 405, body: "Method not allowed" };

  let payload;
  try {
    payload = JSON.parse(event.body);
  } catch {
    return { statusCode: 400, body: JSON.stringify({ error: "Invalid request body" }) };
  }

  const { id } = payload;
  if (!id) return { statusCode: 400, body: JSON.stringify({ error: "Missing id" }) };

  const metaStore = vaultStore("zh-vault-meta");
  const manifest = (await metaStore.get("manifest", { type: "json" })) || { documents: [] };
  manifest.documents = manifest.documents.filter((d) => d.id !== id);
  await metaStore.setJSON("manifest", manifest);

  const filesStore = vaultStore("zh-vault-files");
  await filesStore.delete(id);

  return { statusCode: 200, body: JSON.stringify({ deleted: true }) };
};
