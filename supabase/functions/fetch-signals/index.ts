import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { crypto } from "https://deno.land/std@0.208.0/crypto/mod.ts";
import { encode } from "https://deno.land/std@0.208.0/encoding/hex.ts";

const RSS_FEEDS: Record<string, string> = {
  shortio: "https://blog.short.io/rss",
  tinyurl: "https://tinyurl.com/blog/feed",
  sniply: "https://sniply.io/blog/feed",
};

const SITEMAP_SOURCES: Record<string, { sitemap: string; pathPrefix: string }> = {
  dub: { sitemap: "https://dub.co/sitemap.xml", pathPrefix: "/blog/" },
};

const WEBFLOW_SOURCES: Record<string, { url: string; hrefPattern: RegExp }> = {
  rebrandly: {
    url: "https://www.rebrandly.com/blog",
    hrefPattern: /href="(\/blog\/[a-z0-9-]+)"/g,
  },
};

const UA_BOT = "link-intel/1.0";
const UA_BROWSER = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36";

async function sha256(text: string): Promise<string> {
  const data = new TextEncoder().encode(text);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return new TextDecoder().decode(encode(new Uint8Array(hash)));
}

function parseRss(xml: string) {
  const items: Array<{ title: string; link: string; summary: string }> = [];
  const regex = /<item>([\s\S]*?)<\/item>/gi;
  let m;
  while ((m = regex.exec(xml)) !== null) {
    const b = m[1];
    const title = b.match(/<title><!\[CDATA\[(.*?)\]\]>/)?.[1]
      || b.match(/<title>(.*?)<\/title>/)?.[1] || "";
    const link = b.match(/<link>(.*?)<\/link>/)?.[1] || "";
    const desc = b.match(/<description><!\[CDATA\[([\s\S]*?)\]\]>/)?.[1]
      || b.match(/<description>([\s\S]*?)<\/description>/)?.[1] || "";
    if (title && link) {
      items.push({ title: title.trim(), link: link.trim(), summary: desc.replace(/<[^>]+>/g, "").trim().slice(0, 300) });
    }
  }
  return items;
}

function parseSitemap(xml: string, pathPrefix: string, baseUrl: string) {
  const items: Array<{ title: string; link: string; summary: string }> = [];
  const regex = new RegExp(`<loc>(${baseUrl.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}${pathPrefix}[^<]+)</loc>`, "g");
  let m;
  while ((m = regex.exec(xml)) !== null) {
    const url = m[1];
    const slug = url.split("/").pop() || "";
    const title = slug.replace(/-/g, " ").replace(/\b\w/g, c => c.toUpperCase());
    items.push({ title, link: url, summary: "" });
  }
  return items;
}

function parseWebflow(html: string, pattern: RegExp, baseUrl: string) {
  const items: Array<{ title: string; link: string; summary: string }> = [];
  const seen = new Set<string>();
  let m;
  while ((m = pattern.exec(html)) !== null) {
    const path = m[1];
    if (seen.has(path)) continue;
    seen.add(path);
    const slug = path.split("/").pop() || "";
    const title = slug.replace(/-/g, " ").replace(/\b\w/g, c => c.toUpperCase());
    items.push({ title, link: baseUrl + path, summary: "" });
  }
  return items;
}

async function insertSignals(
  supabase: ReturnType<typeof createClient>,
  competitorId: string,
  items: Array<{ title: string; link: string; summary: string }>,
  signalType: string,
) {
  let count = 0;
  for (const item of items.slice(0, 15)) {
    const hash = await sha256(item.link);
    const { error } = await supabase.from("signals").insert({
      competitor_id: competitorId,
      signal_type: signalType,
      title: item.title,
      summary: item.summary,
      source_url: item.link,
      dedup_hash: hash,
    });
    if (!error) count++;
  }
  return count;
}

Deno.serve(async () => {
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  const { data: competitors } = await supabase.from("competitors").select("id, slug");
  if (!competitors) return new Response("No competitors", { status: 500 });

  const slugToId: Record<string, string> = {};
  for (const c of competitors) slugToId[c.slug] = c.id;

  let inserted = 0, errors = 0;

  for (const [slug, url] of Object.entries(RSS_FEEDS)) {
    const cid = slugToId[slug];
    if (!cid) continue;
    try {
      const resp = await fetch(url, { headers: { "User-Agent": UA_BOT } });
      if (!resp.ok) { errors++; continue; }
      const items = parseRss(await resp.text());
      inserted += await insertSignals(supabase, cid, items, "blog");
    } catch { errors++; }
  }

  for (const [slug, src] of Object.entries(SITEMAP_SOURCES)) {
    const cid = slugToId[slug];
    if (!cid) continue;
    try {
      const resp = await fetch(src.sitemap, { headers: { "User-Agent": UA_BOT } });
      if (!resp.ok) { errors++; continue; }
      const baseUrl = new URL(src.sitemap).origin;
      const items = parseSitemap(await resp.text(), src.pathPrefix, baseUrl);
      inserted += await insertSignals(supabase, cid, items, "blog");
    } catch { errors++; }
  }

  for (const [slug, src] of Object.entries(WEBFLOW_SOURCES)) {
    const cid = slugToId[slug];
    if (!cid) continue;
    try {
      const resp = await fetch(src.url, { headers: { "User-Agent": UA_BROWSER } });
      if (!resp.ok) { errors++; continue; }
      const baseUrl = new URL(src.url).origin;
      const items = parseWebflow(await resp.text(), src.hrefPattern, baseUrl);
      inserted += await insertSignals(supabase, cid, items, "blog");
    } catch { errors++; }
  }

  return new Response(
    JSON.stringify({ inserted, errors, timestamp: new Date().toISOString() }),
    { headers: { "Content-Type": "application/json" } }
  );
});
