// netlify/functions/vault-shared.js
// Deliberately requires NO session cookie — this is the whole point of a
// client share link. Access is controlled entirely by possession of the
// long random token, plus its expiry.
const { vaultStore } = require("./_shared/store");

exports.handler = async (event) => {
  // Token arrives as the trailing path segment (e.g.
  // /.netlify/functions/vault-shared/<token>), not a query parameter —
  // see the comment in netlify.toml for why.
  const segments = (event.path || "").split("/").filter(Boolean);
  const token = segments[segments.length - 1];
  if (!token || token === "vault-shared") return { statusCode: 400, body: "Missing token" };

  const metaStore = vaultStore("zh-vault-meta");
  const manifest = (await metaStore.get("manifest", { type: "json" })) || { documents: [] };
  const doc = manifest.documents.find((d) => d.shareToken === token);

  if (!doc) {
    return { statusCode: 404, body: "This link is invalid or has been revoked." };
  }
  if (!doc.shareExpires || doc.shareExpires < Date.now()) {
    return { statusCode: 410, body: "This link has expired. Please request a new one." };
  }

  const filesStore = vaultStore("zh-vault-files");
  const result = await filesStore.getWithMetadata(doc.id, { type: "arrayBuffer" });
  if (!result) return { statusCode: 404, body: "Document not found." };

  const { data, metadata } = result;
  return {
    statusCode: 200,
    headers: {
      "Content-Type": metadata?.contentType || "application/octet-stream",
      "Content-Disposition": `inline; filename="${metadata?.filename || "document"}"`,
    },
    body: Buffer.from(data).toString("base64"),
    isBase64Encoded: true,
  };
};
