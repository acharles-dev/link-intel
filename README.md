# link-intel

Competitive intelligence dashboard for the link management space. Tracks blog posts and changelog updates across Bitly, Dub, Short.io, Bl.ink, TinyURL, Rebrandly, Sniply, and Cuttly.

**Live:** [link-intel.vercel.app](https://link-intel.vercel.app)

## Supabase Features Used

- **Database (Postgres)** for competitors and signals with deduplication
- **Edge Functions** — Deno worker that fetches RSS feeds and stores new entries
- **Row Level Security** — public read via anon key, writes restricted to service_role

## Background

I built competitive intelligence tools in Flask and Python while leading product marketing at Rebrandly. This project rebuilds that concept on Supabase because Edge Functions + Postgres is a cleaner stack for scheduled data collection.

## Setup

1. Create a Supabase project at [supabase.com](https://supabase.com)
2. Run `supabase/migrations/001_initial_schema.sql` in the SQL editor
3. Run `supabase/seed.sql` to add competitor records
4. Deploy the Edge Function: `supabase functions deploy fetch-signals`
5. Invoke the function manually from the Dashboard to populate initial data
6. Copy project URL + anon key into `index.html`
7. Deploy frontend to Vercel: `vercel --prod`

## Stack

- Vanilla HTML/CSS/JS (dark theme, monospace, no build step)
- Supabase JS client via CDN
- Deno Edge Function for RSS parsing and data collection
