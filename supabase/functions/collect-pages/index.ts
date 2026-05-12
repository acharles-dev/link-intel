import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { crypto } from "https://deno.land/std@0.208.0/crypto/mod.ts";
import { encode } from "https://deno.land/std@0.208.0/encoding/hex.ts";

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36";

async function sha256(text: string): Promise<string> {
  const data = new TextEncoder().encode(text);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return new TextDecoder().decode(encode(new Uint8Array(hash)));
}

function extractText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<nav[\s\S]*?<\/nav>/gi, "")
    .replace(/<footer[\s\S]*?<\/footer>/gi, "")
    .replace(/<header[\s\S]*?<\/header>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 50000);
}

function diffSummary(oldText: string, newText: string): string {
  const oldWords = new Set(oldText.split(/\s+/));
  const newWords = newText.split(/\s+/);
  const added = newWords.filter(w => !oldWords.has(w) && w.length > 3);
  const unique = [...new Set(added)].slice(0, 30);
  if (!unique.length) return "Minor formatting or structural changes detected.";
  return "New content includes: " + unique.join(", ");
}

function severityForPageType(pageType: string): number {
  if (pageType === "pricing") return 5;
  if (pageType === "homepage") return 4;
  if (pageType === "features") return 4;
  return 3;
}

function signalTypeForPageType(pageType: string): string {
  if (pageType === "pricing") return "pricing";
  if (pageType === "homepage") return "messaging";
  return "feature";
}

Deno.serve(async () => {
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  const { data: pages } = await supabase
    .from("monitored_pages")
    .select("*, competitors(id, name, slug)")
    .order("last_checked", { ascending: true, nullsFirst: true });

  if (!pages) return new Response(JSON.stringify({ error: "no pages" }), { status: 500 });

  let checked = 0, changed = 0, errors = 0;

  for (const page of pages) {
    try {
      const resp = await fetch(page.url, {
        headers: { "User-Agent": UA },
        redirect: "follow",
      });
      if (!resp.ok) { errors++; continue; }

      const html = await resp.text();
      const text = extractText(html);
      const hash = await sha256(text);

      checked++;

      if (page.last_hash && hash !== page.last_hash) {
        changed++;
        const diff = diffSummary(page.last_content || "", text);
        const dedupHash = await sha256(`page-change-${page.id}-${hash}`);

        await supabase.from("signals").insert({
          competitor_id: page.competitors.id,
          signal_type: signalTypeForPageType(page.page_type),
          severity: severityForPageType(page.page_type),
          title: `${page.competitors.name} ${page.page_type} page changed`,
          summary: diff,
          source_url: page.url,
          dedup_hash: dedupHash,
        });

        await supabase.from("page_snapshots").insert({
          page_id: page.id,
          content_hash: hash,
          content_excerpt: text.slice(0, 500),
        });
      }

      await supabase
        .from("monitored_pages")
        .update({ last_content: text, last_hash: hash, last_checked: new Date().toISOString() })
        .eq("id", page.id);

    } catch { errors++; }
  }

  return new Response(
    JSON.stringify({ checked, changed, errors, timestamp: new Date().toISOString() }),
    { headers: { "Content-Type": "application/json" } }
  );
});
