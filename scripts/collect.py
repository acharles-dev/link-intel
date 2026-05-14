#!/usr/bin/env python3
"""Collect competitive intelligence from blog feeds, sitemaps, and job boards.

Uses only Python stdlib. Designed to run in GitHub Actions on a daily cron.
"""

import json
import os
import re
import sys
import urllib.request
import xml.etree.ElementTree as ET
from datetime import datetime, timezone

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

COMPETITORS = {
    "bitly": "Bitly",
    "dub": "Dub",
    "shortio": "Short.io",
    "tinyurl": "TinyURL",
    "rebrandly": "Rebrandly",
    "sniply": "Sniply",
}

DATA_DIR = os.path.join(os.path.dirname(__file__), "..", "data")
SIGNALS_PATH = os.path.join(DATA_DIR, "signals.json")
JOBS_PATH = os.path.join(DATA_DIR, "jobs.json")
STATUS_PATH = os.path.join(DATA_DIR, "status.json")

MAX_SIGNALS = 500
USER_AGENT = "LinkIntel/1.0 (GitHub Actions; competitive-intel-dashboard)"
TIMEOUT = 30  # seconds

TODAY = datetime.now(timezone.utc).strftime("%Y-%m-%d")

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def fetch(url: str) -> bytes:
    """Fetch a URL and return the response body as bytes."""
    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    with urllib.request.urlopen(req, timeout=TIMEOUT) as resp:
        return resp.read()


def fetch_text(url: str) -> str:
    return fetch(url).decode("utf-8", errors="replace")


def load_json(path: str, default):
    """Load a JSON file, returning *default* if it doesn't exist or is empty."""
    try:
        with open(path, "r") as f:
            data = json.load(f)
            if data is None:
                return default
            return data
    except (FileNotFoundError, json.JSONDecodeError):
        return default


def save_json(path: str, data):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)
        f.write("\n")


def make_signal(competitor: str, title: str, url: str, source: str, date: str = None) -> dict:
    return {
        "date": date or TODAY,
        "competitor": competitor,
        "competitor_name": COMPETITORS[competitor],
        "type": "blog",
        "title": title.strip() if title else url,
        "url": url.strip(),
        "source": source,
    }


# ---------------------------------------------------------------------------
# Source fetchers
# ---------------------------------------------------------------------------


def fetch_rss(url: str, competitor: str) -> list[dict]:
    """Parse an RSS 2.0 or Atom feed and return signal dicts."""
    signals = []
    try:
        raw = fetch_text(url)
        root = ET.fromstring(raw)

        # RSS 2.0: channel/item
        for item in root.iter("item"):
            title_el = item.find("title")
            link_el = item.find("link")
            pub_date = item.find("pubDate")
            title = title_el.text if title_el is not None and title_el.text else ""
            link = link_el.text if link_el is not None and link_el.text else ""
            date = _parse_rss_date(pub_date.text) if pub_date is not None and pub_date.text else TODAY
            if link:
                signals.append(make_signal(competitor, title, link, "rss", date))

        # Atom: entry
        ns = {"atom": "http://www.w3.org/2005/Atom"}
        for entry in root.iter("{http://www.w3.org/2005/Atom}entry"):
            title_el = entry.find("atom:title", ns)
            link_el = entry.find("atom:link", ns)
            updated_el = entry.find("atom:updated", ns)
            title = title_el.text if title_el is not None and title_el.text else ""
            link = link_el.get("href", "") if link_el is not None else ""
            date = _parse_atom_date(updated_el.text) if updated_el is not None and updated_el.text else TODAY
            if link:
                signals.append(make_signal(competitor, title, link, "rss", date))

    except Exception as e:
        print(f"  [ERROR] RSS {url}: {e}", file=sys.stderr)
    return signals


def _parse_rss_date(date_str: str) -> str:
    """Best-effort parse of RFC 822 date to YYYY-MM-DD."""
    try:
        from email.utils import parsedate_to_datetime
        dt = parsedate_to_datetime(date_str)
        return dt.strftime("%Y-%m-%d")
    except Exception:
        return TODAY


def _parse_atom_date(date_str: str) -> str:
    """Best-effort parse of ISO 8601 date to YYYY-MM-DD."""
    try:
        return date_str[:10]
    except Exception:
        return TODAY


def fetch_sitemap(url: str, competitor: str, path_prefix: str) -> list[dict]:
    """Parse a sitemap XML and extract URLs matching the path prefix."""
    signals = []
    try:
        raw = fetch_text(url)
        root = ET.fromstring(raw)
        # Sitemaps use a namespace
        ns = {"sm": "http://www.sitemaps.org/schemas/sitemap/0.9"}
        for url_el in root.findall(".//sm:url", ns):
            loc_el = url_el.find("sm:loc", ns)
            lastmod_el = url_el.find("sm:lastmod", ns)
            if loc_el is None or loc_el.text is None:
                continue
            loc = loc_el.text.strip()
            # Check if the URL path matches the prefix
            from urllib.parse import urlparse
            parsed = urlparse(loc)
            if parsed.path.startswith(path_prefix) and parsed.path != path_prefix:
                # Extract a title from the URL slug
                slug = parsed.path.rstrip("/").split("/")[-1]
                title = slug.replace("-", " ").title()
                date = lastmod_el.text[:10] if lastmod_el is not None and lastmod_el.text else TODAY
                signals.append(make_signal(competitor, title, loc, "sitemap", date))
    except Exception as e:
        print(f"  [ERROR] Sitemap {url}: {e}", file=sys.stderr)
    return signals


def fetch_rebrandly_blog() -> list[dict]:
    """Scrape the Rebrandly blog page for post links."""
    signals = []
    try:
        html = fetch_text("https://www.rebrandly.com/blog")
        # Match href="/blog/some-slug" but not /blog/ alone or /blog/category/ patterns
        hrefs = re.findall(r'href="(/blog/[a-z0-9][a-z0-9\-]+/?)"', html, re.IGNORECASE)
        seen = set()
        for href in hrefs:
            url = "https://www.rebrandly.com" + href.rstrip("/")
            if url in seen:
                continue
            seen.add(url)
            slug = href.rstrip("/").split("/")[-1]
            title = slug.replace("-", " ").title()
            signals.append(make_signal("rebrandly", title, url, "html"))
    except Exception as e:
        print(f"  [ERROR] Rebrandly blog scrape: {e}", file=sys.stderr)
    return signals


def fetch_greenhouse_jobs(board_name: str, competitor: str) -> list[dict]:
    """Fetch jobs from a Greenhouse public board API."""
    jobs = []
    try:
        url = f"https://boards-api.greenhouse.io/v1/boards/{board_name}/jobs"
        raw = fetch_text(url)
        data = json.loads(raw)
        for job in data.get("jobs", []):
            location_name = ""
            if job.get("location", {}).get("name"):
                location_name = job["location"]["name"]

            departments = job.get("departments", [])
            dept_name = departments[0]["name"] if departments else ""

            jobs.append({
                "competitor": competitor,
                "competitor_name": COMPETITORS[competitor],
                "title": job.get("title", ""),
                "department": dept_name,
                "location": location_name,
                "url": job.get("absolute_url", ""),
                "first_seen": TODAY,
                "last_seen": TODAY,
                "active": True,
            })
    except Exception as e:
        print(f"  [ERROR] Greenhouse {board_name}: {e}", file=sys.stderr)
    return jobs


# ---------------------------------------------------------------------------
# Main collection logic
# ---------------------------------------------------------------------------


def collect_signals() -> tuple[list[dict], dict]:
    """Collect signals from all sources. Returns (new_signals, source_status)."""
    all_signals = []
    status = {}

    # RSS feeds
    rss_sources = [
        ("shortio_rss", "https://blog.short.io/rss", "shortio"),
        ("tinyurl_rss", "https://tinyurl.com/blog/feed", "tinyurl"),
        ("sniply_rss", "https://sniply.io/blog/feed", "sniply"),
    ]
    for source_key, url, competitor in rss_sources:
        print(f"Fetching {source_key}...")
        items = fetch_rss(url, competitor)
        all_signals.extend(items)
        status[source_key] = {"status": "ok", "items": len(items)}
        if not items:
            status[source_key]["status"] = "empty"
        print(f"  -> {len(items)} items")

    # Sitemaps
    sitemap_sources = [
        ("dub_sitemap", "https://dub.co/sitemap.xml", "dub", "/blog/"),
        ("bitly_sitemap", "https://bitly.com/blog-hub/post-sitemap.xml", "bitly", "/blog/"),
    ]
    for source_key, url, competitor, prefix in sitemap_sources:
        print(f"Fetching {source_key}...")
        items = fetch_sitemap(url, competitor, prefix)
        all_signals.extend(items)
        status[source_key] = {"status": "ok", "items": len(items)}
        if not items:
            status[source_key]["status"] = "empty"
        print(f"  -> {len(items)} items")

    # HTML scraping
    print("Fetching rebrandly_html...")
    items = fetch_rebrandly_blog()
    all_signals.extend(items)
    status["rebrandly_html"] = {"status": "ok", "items": len(items)}
    if not items:
        status["rebrandly_html"]["status"] = "empty"
    print(f"  -> {len(items)} items")

    return all_signals, status


def collect_jobs() -> tuple[list[dict], dict]:
    """Collect job postings. Returns (new_jobs, source_status)."""
    all_jobs = []
    status = {}

    print("Fetching bitly_jobs...")
    jobs = fetch_greenhouse_jobs("bitly", "bitly")
    all_jobs.extend(jobs)
    status["bitly_jobs"] = {"status": "ok", "items": len(jobs)}
    if not jobs:
        status["bitly_jobs"]["status"] = "empty"
    print(f"  -> {len(jobs)} jobs")

    return all_jobs, status


def merge_signals(existing: list[dict], new: list[dict]) -> list[dict]:
    """Deduplicate by URL, append new items, trim to MAX_SIGNALS."""
    existing_urls = {s["url"] for s in existing}
    added = 0
    for s in new:
        if s["url"] not in existing_urls:
            existing.append(s)
            existing_urls.add(s["url"])
            added += 1
    print(f"Signals: {added} new, {len(existing)} total")

    # Sort by date descending, then trim
    existing.sort(key=lambda s: s.get("date", ""), reverse=True)
    if len(existing) > MAX_SIGNALS:
        existing = existing[:MAX_SIGNALS]
        print(f"Trimmed to {MAX_SIGNALS} signals")
    return existing


def merge_jobs(existing: list[dict], current: list[dict]) -> list[dict]:
    """Merge job listings: update last_seen for existing, add new, deactivate missing."""
    current_urls = {j["url"] for j in current}
    existing_by_url = {j["url"]: j for j in existing}

    # Mark jobs not in current response as inactive
    for job in existing:
        if job["url"] not in current_urls:
            job["active"] = False
        else:
            job["last_seen"] = TODAY
            job["active"] = True

    # Add new jobs
    added = 0
    for job in current:
        if job["url"] not in existing_by_url:
            existing.append(job)
            added += 1

    print(f"Jobs: {added} new, {sum(1 for j in existing if j['active'])} active, {len(existing)} total")
    return existing


def main():
    print(f"=== Link Intel Collector === {datetime.now(timezone.utc).isoformat()}")
    print()

    # Load existing data
    signals = load_json(SIGNALS_PATH, [])
    jobs = load_json(JOBS_PATH, [])

    # Collect
    new_signals, signal_status = collect_signals()
    print()
    current_jobs, job_status = collect_jobs()
    print()

    # Merge
    signals = merge_signals(signals, new_signals)
    jobs = merge_jobs(jobs, current_jobs)

    # Save
    save_json(SIGNALS_PATH, signals)
    save_json(JOBS_PATH, jobs)

    # Status
    all_status = {**signal_status, **job_status}
    # Mark any source that raised an error
    for key, val in all_status.items():
        if val["items"] == 0 and val["status"] == "ok":
            val["status"] = "empty"

    status = {
        "last_updated": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "sources": all_status,
    }
    save_json(STATUS_PATH, status)

    print()
    print(f"Done. Status written to {STATUS_PATH}")
    print(f"  Signals: {len(signals)}")
    print(f"  Jobs: {len(jobs)}")

    # Report any failures
    failures = [k for k, v in all_status.items() if v["status"] == "error"]
    if failures:
        print(f"\n  WARNINGS: {', '.join(failures)} returned errors", file=sys.stderr)


if __name__ == "__main__":
    main()
