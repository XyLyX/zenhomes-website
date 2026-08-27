// netlify/functions/vault-upload.js
const { vaultStore } = require("./_shared/store");
const crypto = require("crypto");
const { isAuthenticated, unauthorizedResponse } = require("./_shared/auth");

// Netlify Functions have a request payload ceiling (~6MB for synchronous
// invocations). Base64 encoding inflates size by ~33%, so we cap the
// decoded file at 4MB to stay safely under that limit. This is fine for
// PDFs, DOCX, and similar documents; it is not meant for large media files.
const MAX_BYTES = 4 * 1024 * 1024;

exports.handler = async (event) => {
  if (!isAuthenticated(event)) return unauthorizedResponse();
  if (event.httpMethod !== "POST") return { statusCode: 405, body: "Method not allowed" };

  let payload;
  try {
    payload = JSON.parse(event.body);
  } catch {
    return { statusCode: 400, body: JSON.stringify({ error: "Invalid request body" }) };
  }

  const { filename, contentType, base64Data, category } = payload;
  if (!filename || !base64Data) {
    return { statusCode: 400, body: JSON.stringify({ error: "filename and base64Data are required" }) };
  }

  const buffer = Buffer.from(base64Data, "base64");
  if (buffer.length > MAX_BYTES) {
    return {
      statusCode: 413,
      body: JSON.stringify({ error: `File too large. Limit is ${MAX_BYTES / (1024 * 1024)}MB per document.` }),
    };
  }

  const id = crypto.randomUUID();
  const filesStore = vaultStore("zh-vault-files");
  await filesStore.set(id, buffer, { metadata: { filename, contentType: contentType || "application/octet-stream" } });

  const metaStore = vaultStore("zh-vault-meta");
  const manifest = (await metaStore.get("manifest", { type: "json" })) || { documents: [] };
  manifest.documents.unshift({
    id,
    filename,
    contentType: contentType || "application/octet-stream",
    category: category || "Uncategorised",
    size: buffer.length,
    uploadedAt: Date.now(),
  });
  await metaStore.setJSON("manifest", manifest);

  return { statusCode: 200, body: JSON.stringify({ id, filename }) };
};
