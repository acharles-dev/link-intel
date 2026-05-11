import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { crypto } from "https://deno.land/std@0.208.0/crypto/mod.ts";
import { encode } from "https://deno.land/std@0.208.0/encoding/hex.ts";

const FEEDS: Record<string, { blog?: string; changelog?: string }> = {
  bitly: {
    blog: "https://blog.bitly.com/rss",
  },
  dub: {
    blog: "https://dub.co/blog",
    changelog: "https://dub.co/changelog",
  },
  shortio: {
    blog: "https://blog.short.io/rss",
  },
  rebrandly: {
    blog: "https://www.rebrandly.com/blog/rss",
  },
  sniply: {
    blog: "https://blog.sniply.io/rss",
  },
};

async function sha256(text: string): Promise<string> {
  const data = new TextEncoder().encode(text);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return new TextDecoder().decode(encode(new Uint8Array(hash)));
}

function extractRssItems(xml: string): Array<{ title: string; link: string; description: string }> {
  const items: Array<{ title: string; link: string; description: string }> = [];
  const itemRegex = /<item>([\s\S]*?)<\/item>/gi;
  let match;
  while ((match = itemRegex.exec(xml)) !== null) {
    const block = match[1];
    const title = block.match(/<title><!\[CDATA\[(.*?)\]\]>|<title>(.*?)<\/title>/)?.[1] || block.match(/<title>(.*?)<\/title>/)?.[1] || "";
    const link = block.match(/<link>(.*?)<\/link>/)?.[1] || "";
    const desc = block.match(/<description><!\[CDATA\[(.*?)\]\]>|<description>(.*?)<\/description>/)?.[1] || "";
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

Deno.serve(async () => {
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  const { data: competitors } = await supabase.from("competitors").select("id, slug");
  if (!competitors) return new Response("No competitors found", { status: 500 });

  const slugToId: Record<string, string> = {};
  for (const c of competitors) {
    slugToId[c.slug] = c.id;
  }

  let inserted = 0;
  let errors = 0;

  for (const [slug, feeds] of Object.entries(FEEDS)) {
    const competitorId = slugToId[slug];
    if (!competitorId) continue;

    for (const [feedType, url] of Object.entries(feeds)) {
      if (!url) continue;
      try {
        const resp = await fetch(url, {
          headers: { "User-Agent": "link-intel/1.0" },
        });
        if (!resp.ok) continue;

        const text = await resp.text();
        const items = extractRssItems(text);

        for (const item of items.slice(0, 10)) {
          const hash = await sha256(item.link || item.title);
          const { error } = await supabase.from("signals").insert({
            competitor_id: competitorId,
            signal_type: feedType === "changelog" ? "changelog" : "blog",
            title: item.title,
            summary: item.description,
            source_url: item.link,
            dedup_hash: hash,
          });
          if (!error) inserted++;
        }
      } catch {
        errors++;
      }
    }
  }

  return new Response(
    JSON.stringify({ inserted, errors, timestamp: new Date().toISOString() }),
    { headers: { "Content-Type": "application/json" } }
  );
});
