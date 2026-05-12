import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { crypto } from "https://deno.land/std@0.208.0/crypto/mod.ts";
import { encode } from "https://deno.land/std@0.208.0/encoding/hex.ts";

// Verified working RSS feeds + HTML scrape targets
const RSS_FEEDS: Record<string, string> = {
  shortio: "https://blog.short.io/rss",
  tinyurl: "https://tinyurl.com/blog/feed",
  sniply: "https://sniply.io/blog/feed",
};

// Competitors without RSS: scrape their blog index pages for post links
const SCRAPE_TARGETS: Record<string, { url: string; titleSelector: string }> = {
  bitly: { url: "https://bitly.com/blog", titleSelector: "article" },
  dub: { url: "https://dub.co/blog", titleSelector: "article" },
  rebrandly: { url: "https://www.rebrandly.com/blog", titleSelector: "article" },
};

async function sha256(text: string): Promise<string> {
  const data = new TextEncoder().encode(text);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return new TextDecoder().decode(encode(new Uint8Array(hash)));
}

function extractRssItems(xml: string) {
  const items: Array<{ title: string; link: string; description: string }> = [];
  const itemRegex = /<item>([\s\S]*?)<\/item>/gi;
  let match;
  while ((match = itemRegex.exec(xml)) !== null) {
    const b = match[1];
    const title = b.match(/<title><!\[CDATA\[(.*?)\]\]>/)?.[1]
      || b.match(/<title>(.*?)<\/title>/)?.[1] || "";
    const link = b.match(/<link>(.*?)<\/link>/)?.[1] || "";
    const desc = b.match(/<description><!\[CDATA\[([\s\S]*?)\]\]>/)?.[1]
      || b.match(/<description>([\s\S]*?)<\/description>/)?.[1] || "";
    if (title && link) {
      items.push({
        title: title.trim(),
        link: link.trim(),
        description: desc.replace(/<[^>]+>/g, "").trim().slice(0, 300),
      });
    }
  }
  return items;
}

function extractBlogLinks(html: string, baseUrl: string) {
  const items: Array<{ title: string; link: string; description: string }> = [];
  // Extract links from anchor tags that look like blog posts
  const linkRegex = /<a[^>]*href="([^"]*(?:\/blog\/|\/changelog\/)[^"]*)"[^>]*>([^<]*)</g;
  let match;
  const seen = new Set<string>();
  while ((match = linkRegex.exec(html)) !== null) {
    let [, href, text] = match;
    text = text.trim();
    if (!text || text.length < 10 || seen.has(href)) continue;
    seen.add(href);
    if (href.startsWith("/")) href = new URL(href, baseUrl).toString();
    items.push({ title: text, link: href, description: "" });
  }
  return items.slice(0, 10);
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

  // Fetch RSS feeds
  for (const [slug, url] of Object.entries(RSS_FEEDS)) {
    const cid = slugToId[slug];
    if (!cid) continue;
    try {
      const resp = await fetch(url, { headers: { "User-Agent": "link-intel/1.0" } });
      if (!resp.ok) { errors++; continue; }
      const xml = await resp.text();
      for (const item of extractRssItems(xml).slice(0, 10)) {
        const hash = await sha256(item.link);
        const { error } = await supabase.from("signals").insert({
          competitor_id: cid, signal_type: "blog",
          title: item.title, summary: item.description,
          source_url: item.link, dedup_hash: hash,
        });
        if (!error) inserted++;
      }
    } catch { errors++; }
  }

  // Scrape blog pages for competitors without RSS
  for (const [slug, target] of Object.entries(SCRAPE_TARGETS)) {
    const cid = slugToId[slug];
    if (!cid) continue;
    try {
      const resp = await fetch(target.url, {
        headers: { "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36" },
      });
      if (!resp.ok) { errors++; continue; }
      const html = await resp.text();
      for (const item of extractBlogLinks(html, target.url)) {
        const hash = await sha256(item.link);
        const { error } = await supabase.from("signals").insert({
          competitor_id: cid, signal_type: "blog",
          title: item.title, summary: item.description,
          source_url: item.link, dedup_hash: hash,
        });
        if (!error) inserted++;
      }
    } catch { errors++; }
  }

  return new Response(
    JSON.stringify({ inserted, errors, timestamp: new Date().toISOString() }),
    { headers: { "Content-Type": "application/json" } }
  );
});
