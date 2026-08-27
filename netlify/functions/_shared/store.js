// netlify/functions/_shared/store.js
//
// @netlify/blobs is supposed to auto-detect the site ID and an access token
// from the Function's runtime environment. In practice this auto-injection
// fails intermittently on some sites/accounts (a known, widely-reported
// Netlify platform issue — MissingBlobsEnvironmentError), so this helper
// configures it explicitly instead, using two environment variables you set
// yourself in the Netlify dashboard:
//
//   BLOBS_SITE_ID  — this project's Site ID (find it via `netlify status`,
//                    or Project configuration > General > Site details)
//   BLOBS_TOKEN    — a Personal Access Token: User settings (click your
//                    avatar) > Applications > Personal access tokens >
//                    New access token
//
const { getStore } = require("@netlify/blobs");

function vaultStore(name) {
  const siteID = process.env.BLOBS_SITE_ID;
  const token = process.env.BLOBS_TOKEN;

  if (!siteID || !token) {
    throw new Error(
      "Vault storage is not configured: set BLOBS_SITE_ID and BLOBS_TOKEN " +
      "as environment variables in Netlify (Site configuration > Environment variables)."
    );
  }

  return getStore({ name, siteID, token });
}

module.exports = { vaultStore };
