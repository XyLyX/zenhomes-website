// netlify/functions/vault-list.js
const { vaultStore } = require("./_shared/store");
const { isAuthenticated, unauthorizedResponse } = require("./_shared/auth");

exports.handler = async (event) => {
  if (!isAuthenticated(event)) return unauthorizedResponse();

  const store = vaultStore("zh-vault-meta");
  const manifest = (await store.get("manifest", { type: "json" })) || { documents: [] };

  // Never expose share tokens in the list response — a document's own
  // owner can generate a fresh share link, but the list view shouldn't
  // leak existing tokens to anything reading this endpoint.
  const documents = manifest.documents.map(({ shareToken, shareExpires, ...rest }) => ({
    ...rest,
    hasActiveShare: !!(shareToken && shareExpires && shareExpires > Date.now()),
  }));

  return {
    statusCode: 200,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ documents }),
  };
};
