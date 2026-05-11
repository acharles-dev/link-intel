# link-intel

Competitive intelligence dashboard for the link management space. Tracks blog posts, changelog updates, pricing changes, and feature announcements across Bitly, Dub, Short.io, Bl.ink, TinyURL, Rebrandly, Sniply, and Cuttly.

**Live:** [link-intel.vercel.app](https://link-intel.vercel.app)

## Supabase Features Used

- **Database (Postgres)** with proper schema design for competitors, signals, and pricing snapshots
- **Edge Functions** as a scheduled cron worker that fetches RSS feeds and scrapes pricing pages
- **Row Level Security** for safe public read access with the anon key
- **pg_cron** for scheduled data collection

## Background

I built competitive intelligence tools in Flask and Python while leading product marketing at Rebrandly. This project rebuilds that tooling on Supabase because Edge Functions + Postgres is a cleaner stack for scheduled data collection than Flask + cron + SQLite.

## Setup

1. Create a Supabase project at [supabase.com](https://supabase.com)
2. Run `supabase/migrations/001_initial_schema.sql` in the SQL editor
3. Run `supabase/seed.sql` to add competitor records
4. Deploy the Edge Function: `supabase functions deploy fetch-signals`
5. Set up pg_cron to invoke the function daily
6. Copy project URL + anon key into `index.html`
7. Deploy frontend to Vercel: `vercel --prod`

## Stack

- Vanilla HTML/CSS/JS (dark theme, monospace, no build step)
- Supabase JS client via CDN
- Deno Edge Function for RSS parsing and data collection
