#!/usr/bin/env node
/**
 * Generates two RSS 2.0 feeds from the site's own existing content —
 * no separate content database, no invented dates.
 *
 *   /insights/feed.xml   — sourced from each insights/<slug>/index.html's
 *                          JSON-LD Article block (datePublished, headline,
 *                          description, canonical URL).
 *   /portfolio/feed.xml  — sourced from portfolio.html's own dated listing
 *                          rows (<a class="index-row" data-published="...">).
 *                          Undated sample/indicative listings are skipped
 *                          because they carry no data-published attribute
 *                          at all — that omission IS the "exclude this"
 *                          signal, not a bug to work around.
 *
 * Run at Netlify build time (see package.json "build" script + netlify.toml
 * [build] command). Writes the two feed files into the existing publish
 * directory alongside everything else already in the repo. Touches nothing
 * under /vault, /netlify/functions, /netlify/edge-functions, or any
 * redirect/edge-function config.
 */

const fs = require("fs");
const path = require("path");

const SITE_ROOT = path.resolve(__dirname, "..");
const SITE_URL = "https://zenhomesglobal.com";

// ---------- small helpers ----------

// The source markup we extract from (portfolio.html) is raw HTML and may
// contain HTML entities (e.g. "&amp;" for a literal "&" in "Bashayer
// Residences 1&2"). Decode those BEFORE re-escaping for XML output, or
// they double-escape into "&amp;amp;". JSON-LD text (used for the
// Insights feed) is already plain decoded text straight out of JSON.parse
// and never needs this.
const HTML_ENTITIES = {
  "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"', "&#39;": "'",
  "&apos;": "'", "&mdash;": "—", "&ndash;": "–", "&nbsp;": " ",
};
function decodeHtmlEntities(str) {
  return String(str).replace(/&(amp|lt|gt|quot|#39|apos|mdash|ndash|nbsp);/g, (m) => HTML_ENTITIES[m] || m);
}

function escapeXml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

// RFC 822 date string. We only ever know a *date* (YYYY-MM-DD), never a
// real time of publication, so the time-of-day here is a fixed, documented
// placeholder (09:00 Gulf Standard Time) rather than invented precision.
// It is applied uniformly so relative ordering between same-day items is
// stable, never used to imply we know an exact publish time.
const PLACEHOLDER_TIME = "09:00:00 +0400";
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

function isValidDateString(s) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(s + "T00:00:00Z");
  return !isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

function toRfc822(dateStr) {
  // dateStr: "YYYY-MM-DD". Build the weekday/month from a UTC-anchored
  // Date so the calendar date itself never shifts under a local TZ.
  const d = new Date(dateStr + "T00:00:00Z");
  const weekday = WEEKDAYS[d.getUTCDay()];
  const day = String(d.getUTCDate()).padStart(2, "0");
  const month = MONTHS[d.getUTCMonth()];
  const year = d.getUTCFullYear();
  return `${weekday}, ${day} ${month} ${year} ${PLACEHOLDER_TIME}`;
}

function nowRfc822() {
  const d = new Date();
  const weekday = WEEKDAYS[d.getUTCDay()];
  const day = String(d.getUTCDate()).padStart(2, "0");
  const month = MONTHS[d.getUTCMonth()];
  const year = d.getUTCFullYear();
  const hh = String(d.getUTCHours()).padStart(2, "0");
  const mm = String(d.getUTCMinutes()).padStart(2, "0");
  const ss = String(d.getUTCSeconds()).padStart(2, "0");
  return `${weekday}, ${day} ${month} ${year} ${hh}:${mm}:${ss} +0000`;
}

function readFile(p) {
  return fs.readFileSync(p, "utf8");
}

function extractJsonLdArticle(html) {
  const blocks = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)];
  for (const m of blocks) {
    try {
      const obj = JSON.parse(m[1]);
      if (obj["@type"] === "Article") return obj;
    } catch (e) {
      // malformed JSON-LD block — skip it, don't crash the whole build
    }
  }
  return null;
}

function extractCanonical(html) {
  const m = html.match(/<link rel="canonical" href="([^"]+)">/);
  return m ? m[1] : null;
}

function mimeFor(file) {
  const ext = path.extname(file).toLowerCase();
  return { ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".webp": "image/webp" }[ext] || "application/octet-stream";
}

// ---------- Insights feed ----------

function collectInsightsItems() {
  const insightsDir = path.join(SITE_ROOT, "insights");
  const entries = fs.readdirSync(insightsDir, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    .sort();

  const items = [];
  const missingDates = [];
  const otherIssues = [];

  for (const slug of entries) {
    const file = path.join(insightsDir, slug, "index.html");
    if (!fs.existsSync(file)) continue;
    const html = readFile(file);
    const article = extractJsonLdArticle(html);
    const canonical = extractCanonical(html) || `${SITE_URL}/insights/${slug}/`;

    if (!article) {
      otherIssues.push(`${slug}: no Article JSON-LD block found — skipped`);
      continue;
    }
    const datePublished = article.datePublished;
    if (!datePublished || !isValidDateString(datePublished)) {
      missingDates.push(slug);
      continue; // per spec: do not publish undated articles, do not guess
    }
    if (!article.headline || !article.description) {
      otherIssues.push(`${slug}: missing headline or description in JSON-LD — skipped`);
      continue;
    }

    items.push({
      title: article.headline,
      link: canonical,
      guid: canonical,
      pubDate: datePublished,
      description: article.description,
      image: null, // no insights article currently has a unique per-article image;
                    // every one only has the generic sitewide OG card, which would
                    // misrepresent itself as article-specific artwork if reused here
    });
  }

  items.sort((a, b) => (a.pubDate < b.pubDate ? 1 : a.pubDate > b.pubDate ? -1 : 0));
  return { items, missingDates, otherIssues };
}

// ---------- Portfolio feed ----------

function collectPortfolioItems() {
  const file = path.join(SITE_ROOT, "portfolio.html");
  const html = readFile(file);

  // Only rows that carry data-published are genuine, dated, public
  // Portfolio entries. The undated "indicative" sample rows (Palm
  // Jumeirah, Emirates Hills, etc.) have no data-published attribute at
  // all, which is exactly the signal we use to exclude them — no separate
  // allow-list needed.
  const rowRe = /<li><a class="index-row" data-published="(\d{4}-\d{2}-\d{2})" href="([^"]+)">([\s\S]*?)<\/a><\/li>/g;

  const items = [];
  let m;
  while ((m = rowRe.exec(html))) {
    const [, datePublished, href, inner] = m;
    if (!isValidDateString(datePublished)) continue;

    // index-name can contain a nested badge span (e.g. "Live Now"), so its
    // real end is the LAST </span> immediately before <span class="pl-desc">
    // — not the first </span> encountered, which would be the badge's own.
    const nameMatch = inner.match(/<span class="index-name">([\s\S]*?)<\/span>(?=<span class="pl-desc">)/);
    const descMatch = inner.match(/<span class="pl-desc">([\s\S]*?)<\/span>/);
    if (!nameMatch || !descMatch) continue;

    // Strip nested badge markup (e.g. the "Live Now" tag) — the WHOLE
    // <span...>...</span>, tag and its text together, not just the tag
    // markers (which would otherwise leave "Live Now" glued onto the title).
    const stripBadges = (s) => s.replace(/<span[^>]*>[\s\S]*?<\/span>/g, "").replace(/<[^>]+>/g, "").trim();
    const title = decodeHtmlEntities(stripBadges(nameMatch[1]));
    const description = decodeHtmlEntities(stripBadges(descMatch[1]));

    const link = href.startsWith("http") ? href : `${SITE_URL}${href.startsWith("/") ? "" : "/"}${href}`;
    const slug = href.replace(/^\//, "").replace(/\/$/, "");

    // Authentic per-project image: each project page's own hero render,
    // if the file genuinely exists on disk — never the generic sitewide
    // OG card, and never a stock substitute.
    let image = null;
    const heroPath = path.join(SITE_ROOT, slug, "img", "hero.jpg");
    if (fs.existsSync(heroPath)) {
      const stat = fs.statSync(heroPath);
      image = {
        url: `${SITE_URL}/${slug}/img/hero.jpg`,
        length: stat.size,
        type: mimeFor(heroPath),
      };
    }

    items.push({ title, link, guid: link, pubDate: datePublished, description, image });
  }

  items.sort((a, b) => (a.pubDate < b.pubDate ? 1 : a.pubDate > b.pubDate ? -1 : 0));
  return { items };
}

// ---------- RSS rendering ----------

function renderItem(item) {
  let xml = "    <item>\n";
  xml += `      <title>${escapeXml(item.title)}</title>\n`;
  xml += `      <link>${escapeXml(item.link)}</link>\n`;
  xml += `      <guid isPermaLink="true">${escapeXml(item.guid)}</guid>\n`;
  xml += `      <pubDate>${toRfc822(item.pubDate)}</pubDate>\n`;
  xml += `      <description>${escapeXml(item.description)}</description>\n`;
  if (item.image) {
    xml += `      <enclosure url="${escapeXml(item.image.url)}" length="${item.image.length}" type="${item.image.type}"/>\n`;
    xml += `      <media:content url="${escapeXml(item.image.url)}" type="${item.image.type}" medium="image"/>\n`;
  }
  xml += "    </item>\n";
  return xml;
}

function renderFeed({ title, description, channelLink, feedUrl, items }) {
  let xml = '<?xml version="1.0" encoding="UTF-8"?>\n';
  xml += '<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom" xmlns:media="http://search.yahoo.com/mrss/">\n';
  xml += "  <channel>\n";
  xml += `    <title>${escapeXml(title)}</title>\n`;
  xml += `    <link>${escapeXml(channelLink)}</link>\n`;
  xml += `    <description>${escapeXml(description)}</description>\n`;
  xml += "    <language>en</language>\n";
  xml += `    <atom:link href="${escapeXml(feedUrl)}" rel="self" type="application/rss+xml"/>\n`;
  xml += `    <lastBuildDate>${nowRfc822()}</lastBuildDate>\n`;
  for (const item of items) xml += renderItem(item);
  xml += "  </channel>\n";
  xml += "</rss>\n";
  return xml;
}

// ---------- main ----------

function main() {
  const problems = [];

  const insights = collectInsightsItems();
  const insightsFeed = renderFeed({
    title: "Zen Homes — Insights",
    description: "Original research, investment analysis and advisory articles from Zen Homes, a private property advisory for Dubai and UAE real estate.",
    channelLink: `${SITE_URL}/insights/`,
    feedUrl: `${SITE_URL}/insights/feed.xml`,
    items: insights.items,
  });
  const insightsOutDir = path.join(SITE_ROOT, "insights");
  fs.mkdirSync(insightsOutDir, { recursive: true });
  fs.writeFileSync(path.join(insightsOutDir, "feed.xml"), insightsFeed, "utf8");

  const portfolio = collectPortfolioItems();
  const portfolioFeed = renderFeed({
    title: "Zen Homes — Portfolio Intelligence",
    description: "Publicly presented property opportunities and portfolio publications from Zen Homes, a private property advisory for Dubai and UAE real estate.",
    channelLink: `${SITE_URL}/portfolio`,
    feedUrl: `${SITE_URL}/portfolio/feed.xml`,
    items: portfolio.items,
  });
  const portfolioOutDir = path.join(SITE_ROOT, "portfolio");
  fs.mkdirSync(portfolioOutDir, { recursive: true });
  fs.writeFileSync(path.join(portfolioOutDir, "feed.xml"), portfolioFeed, "utf8");

  console.log(`[feeds] insights/feed.xml: ${insights.items.length} item(s)`);
  console.log(`[feeds] portfolio/feed.xml: ${portfolio.items.length} item(s)`);

  if (insights.missingDates.length) {
    console.warn(`[feeds] WARNING — insights articles skipped for missing/invalid datePublished (${insights.missingDates.length}):`);
    for (const slug of insights.missingDates) console.warn(`  - insights/${slug}/`);
    problems.push("missing-insights-dates");
  }
  if (insights.otherIssues.length) {
    console.warn(`[feeds] WARNING — insights articles skipped for other reasons:`);
    for (const msg of insights.otherIssues) console.warn(`  - ${msg}`);
    problems.push("insights-metadata-issues");
  }

  // Build never fails outright over missing per-article dates — the
  // correct behavior is "don't publish that one item", not "break the
  // whole site deploy". The warnings above are what surface it.
  if (problems.length) {
    console.warn(`[feeds] Completed with warnings: ${problems.join(", ")}. See above for affected slugs.`);
  }
}

main();
