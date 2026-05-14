# Link Intel

Competitive intelligence dashboard for the link-management space. Tracks blog posts and job postings from 6 competitors, updated daily.

**Live site:** [acharles-dev.github.io/link-intel/](https://acharles-dev.github.io/link-intel/)

## How it works

1. A Python script (`scripts/collect.py`) fetches blog posts from RSS feeds, sitemaps, and HTML scraping, plus job postings from Greenhouse APIs.
2. A GitHub Actions workflow runs the script daily at 2pm UTC, then commits the results to `data/`.
3. A static HTML/CSS/JS dashboard reads the JSON data files and renders them. Hosted on GitHub Pages.

No external services, databases, or API keys required. Everything runs on GitHub's free tier.

## Competitors tracked

| Competitor | Blog source | Jobs source |
|---|---|---|
| Bitly | Sitemap | Greenhouse API |
| Dub | Sitemap | -- |
| Short.io | RSS | -- |
| TinyURL | RSS | -- |
| Rebrandly | HTML scrape | -- |
| Sniply | RSS | -- |

## Run manually

Go to the **Actions** tab in this repo, select "Collect Competitive Intel", and click "Run workflow". Results will be committed to the `data/` directory within a few minutes.

## Local development

```bash
# Collect data locally
python scripts/collect.py

# Serve the dashboard
python -m http.server 8000
# Open http://localhost:8000
```
