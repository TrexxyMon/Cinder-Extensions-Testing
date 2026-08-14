import { writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const sitemapUrl = "https://readcomicsonline.ru/sitemap-comics.xml";
const outputUrl = new URL("../readcomicsonline-index.json", import.meta.url);

function decodeXml(value) {
  return String(value || "")
    .replace(/^<!\[CDATA\[|\]\]>$/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(Number.parseInt(hex, 16)))
    .replace(/&#([0-9]+);/g, (_, decimal) => String.fromCodePoint(Number.parseInt(decimal, 10)))
    .trim();
}

const response = await fetch(sitemapUrl, {
  headers: { Accept: "application/xml,text/xml,*/*" },
});
if (!response.ok) {
  throw new Error(`Sitemap request failed with HTTP ${response.status}`);
}

const xml = await response.text();
const items = [];
const seen = new Set();
for (const match of xml.matchAll(/<url>([\s\S]*?)<\/url>/gi)) {
  const block = match[1];
  const location = block.match(/<loc>\s*([^<]+?)\s*<\/loc>/i)?.[1];
  const slug = decodeXml(location).match(/\/comic\/([^/?#<]+)/i)?.[1];
  if (!slug || seen.has(slug)) continue;
  const caption = block.match(/<image:caption>\s*([\s\S]*?)\s*<\/image:caption>/i)?.[1];
  const modified = block.match(/<lastmod>\s*([^<]+?)\s*<\/lastmod>/i)?.[1];
  const title = decodeXml(caption) || slug.replace(/[-_]+/g, " ");
  items.push([slug, title, decodeXml(modified)]);
  seen.add(slug);
}

if (items.length < 1000) {
  throw new Error(`Refusing to write an incomplete index with ${items.length} titles`);
}

const payload = JSON.stringify({
  generatedAt: new Date().toISOString(),
  source: sitemapUrl,
  items,
});
await writeFile(outputUrl, `${payload}\n`, "utf8");
console.log(`Wrote ${items.length} titles to ${fileURLToPath(outputUrl)}`);
