import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const UA = "link-intel/1.0";

interface Job {
  externalId: string;
  title: string;
  department: string;
  location: string;
  url: string;
}

async function fetchGreenhouseJobs(boardToken: string): Promise<Job[]> {
  try {
    const resp = await fetch(
      `https://boards-api.greenhouse.io/v1/boards/${boardToken}/jobs`,
      { headers: { "User-Agent": UA } }
    );
    if (!resp.ok) return [];
    const data = await resp.json();
    return (data.jobs || []).map((j: any) => ({
      externalId: String(j.id),
      title: j.title,
      department: j.departments?.[0]?.name || "",
      location: j.location?.name || "",
      url: j.absolute_url || `https://boards.greenhouse.io/${boardToken}/jobs/${j.id}`,
    }));
  } catch { return []; }
}

async function fetchAshbyJobs(boardToken: string): Promise<Job[]> {
  try {
    const resp = await fetch(
      `https://api.ashbyhq.com/posting-api/job-board/${boardToken}`,
      { headers: { "User-Agent": UA } }
    );
    if (!resp.ok) return [];
    const data = await resp.json();
    return (data.jobs || []).map((j: any) => ({
      externalId: j.id,
      title: j.title,
      department: j.department || "",
      location: j.location || "",
      url: j.jobUrl || `https://jobs.ashbyhq.com/${boardToken}/${j.id}`,
    }));
  } catch { return []; }
}

async function fetchLeverJobs(company: string): Promise<Job[]> {
  try {
    const resp = await fetch(
      `https://api.lever.co/v0/postings/${company}?mode=json`,
      { headers: { "User-Agent": UA } }
    );
    if (!resp.ok) return [];
    const data = await resp.json();
    return data.map((j: any) => ({
      externalId: j.id,
      title: j.text,
      department: j.categories?.department || "",
      location: j.categories?.location || "",
      url: j.hostedUrl || j.applyUrl || "",
    }));
  } catch { return []; }
}

// Known ATS configurations for link management competitors
const ATS_CONFIG: Record<string, { type: string; token: string }> = {
  bitly: { type: "greenhouse", token: "bitly" },
  dub: { type: "ashby", token: "dubinc" },
};

// Also try common board tokens for competitors we don't know
const GUESS_TOKENS: Record<string, string[]> = {
  shortio: ["short-io", "shortio"],
  tinyurl: ["tinyurl"],
  sniply: ["sniply", "snip-ly"],
};

Deno.serve(async () => {
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  const { data: competitors } = await supabase.from("competitors").select("id, slug, ats_type, ats_board_token");
  if (!competitors) return new Response(JSON.stringify({ error: "no competitors" }), { status: 500 });

  let totalNew = 0, totalClosed = 0, errors = 0;

  for (const comp of competitors) {
    let jobs: Job[] = [];

    // Try known ATS config
    const config = ATS_CONFIG[comp.slug];
    if (config) {
      if (config.type === "greenhouse") jobs = await fetchGreenhouseJobs(config.token);
      else if (config.type === "ashby") jobs = await fetchAshbyJobs(config.token);
      else if (config.type === "lever") jobs = await fetchLeverJobs(config.token);
    }

    // Try guessing for unknown competitors
    if (!jobs.length && GUESS_TOKENS[comp.slug]) {
      for (const token of GUESS_TOKENS[comp.slug]) {
        if (jobs.length) break;
        jobs = await fetchGreenhouseJobs(token);
        if (!jobs.length) jobs = await fetchAshbyJobs(token);
        if (!jobs.length) jobs = await fetchLeverJobs(token);
      }
    }

    if (!jobs.length) continue;

    // Get existing active postings for this competitor
    const { data: existing } = await supabase
      .from("job_postings")
      .select("external_id")
      .eq("competitor_id", comp.id)
      .eq("is_active", true);

    const existingIds = new Set((existing || []).map(e => e.external_id));
    const currentIds = new Set(jobs.map(j => j.externalId));

    // Insert new postings
    for (const job of jobs) {
      if (existingIds.has(job.externalId)) {
        // Update last_seen
        await supabase
          .from("job_postings")
          .update({ last_seen: new Date().toISOString() })
          .eq("competitor_id", comp.id)
          .eq("external_id", job.externalId);
        continue;
      }

      const { error } = await supabase.from("job_postings").insert({
        competitor_id: comp.id,
        external_id: job.externalId,
        title: job.title,
        department: job.department,
        location: job.location,
        url: job.url,
      });

      if (!error) {
        totalNew++;
        // Create a signal for new job postings
        const dedupHash = `job-${comp.id}-${job.externalId}`;
        await supabase.from("signals").insert({
          competitor_id: comp.id,
          signal_type: "hiring",
          severity: 3,
          title: `${comp.slug}: hiring ${job.title}`,
          summary: `New role: ${job.title} (${job.department || "Unknown dept"}) in ${job.location || "Unknown location"}`,
          source_url: job.url,
          dedup_hash: dedupHash,
        }).then(() => {}, () => {}); // Ignore dedup conflicts
      }
    }

    // Mark removed postings as inactive
    for (const eid of existingIds) {
      if (!currentIds.has(eid)) {
        await supabase
          .from("job_postings")
          .update({ is_active: false })
          .eq("competitor_id", comp.id)
          .eq("external_id", eid);
        totalClosed++;
      }
    }
  }

  return new Response(
    JSON.stringify({ newJobs: totalNew, closedJobs: totalClosed, errors, timestamp: new Date().toISOString() }),
    { headers: { "Content-Type": "application/json" } }
  );
});
