// netlify/functions/vault-download.js
const { vaultStore } = require("./_shared/store");
const { isAuthenticated, unauthorizedResponse } = require("./_shared/auth");

exports.handler = async (event) => {
  if (!isAuthenticated(event)) return unauthorizedResponse();

  const id = event.queryStringParameters?.id;
  if (!id) return { statusCode: 400, body: JSON.stringify({ error: "Missing id" }) };

  const filesStore = vaultStore("zh-vault-files");
  const result = await filesStore.getWithMetadata(id, { type: "arrayBuffer" });
  if (!result) return { statusCode: 404, body: JSON.stringify({ error: "Document not found" }) };

  const { data, metadata } = result;
  return {
    statusCode: 200,
    headers: {
      "Content-Type": metadata?.contentType || "application/octet-stream",
      "Content-Disposition": `attachment; filename="${metadata?.filename || "document"}"`,
    },
    body: Buffer.from(data).toString("base64"),
    isBase64Encoded: true,
  };
};
