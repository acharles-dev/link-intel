/* ---------------------------------------------------------------
   Link Intel - Dashboard renderer
   Fetches JSON data files and renders signals + jobs.
   --------------------------------------------------------------- */

const ACCENT_COLORS = {
    bitly:     "#ee6123",
    dub:       "#7c3aed",
    shortio:   "#10b981",
    tinyurl:   "#f59e0b",
    rebrandly: "#3b82f6",
    sniply:    "#ec4899",
};

const MAX_SIGNALS_SHOWN = 50;

let allSignals = [];
let allJobs = [];
let activeFilter = "all";

// ---- Bootstrap ----

document.addEventListener("DOMContentLoaded", async () => {
    const [signals, jobs, status] = await Promise.all([
        fetchJSON("data/signals.json"),
        fetchJSON("data/jobs.json"),
        fetchJSON("data/status.json"),
    ]);

    allSignals = signals || [];
    allJobs = (jobs || []).filter(j => j.active);

    updateStats(status);
    renderSignals();
    renderJobs();
    bindFilters();
});

// ---- Data fetching ----

async function fetchJSON(path) {
    try {
        const resp = await fetch(path);
        if (!resp.ok) return null;
        return await resp.json();
    } catch {
        return null;
    }
}

// ---- Stats ----

function updateStats(status) {
    document.getElementById("stat-signals").textContent = allSignals.length || "0";
    document.getElementById("stat-jobs").textContent = allJobs.length || "0";

    const updated = status && status.last_updated;
    if (updated) {
        const d = new Date(updated);
        document.getElementById("stat-updated").textContent = d.toLocaleDateString("en-US", {
            month: "short", day: "numeric", year: "numeric"
        });
    } else {
        document.getElementById("stat-updated").textContent = "Never";
    }
}

// ---- Render signals ----

function renderSignals() {
    const container = document.getElementById("signals-grid");
    const filtered = activeFilter === "all"
        ? allSignals
        : allSignals.filter(s => s.competitor === activeFilter);

    const visible = filtered.slice(0, MAX_SIGNALS_SHOWN);

    if (visible.length === 0) {
        container.innerHTML = '<p class="empty-state">No data collected yet. Run the workflow manually or wait for the daily schedule.</p>';
        return;
    }

    container.innerHTML = visible.map(s => {
        const accent = ACCENT_COLORS[s.competitor] || "#64748b";
        return `
            <div class="signal-card" style="--card-accent: ${accent}">
                <div class="meta">
                    <span class="competitor-badge">${escapeHTML(s.competitor_name)}</span>
                    <span class="date">${escapeHTML(s.date)}</span>
                </div>
                <div class="title">
                    <a href="${escapeHTML(s.url)}" target="_blank" rel="noopener">${escapeHTML(s.title)}</a>
                </div>
                <span class="source-tag">${escapeHTML(s.source)}</span>
            </div>`;
    }).join("");
}

// ---- Render jobs ----

function renderJobs() {
    const tbody = document.getElementById("jobs-body");
    const filtered = activeFilter === "all"
        ? allJobs
        : allJobs.filter(j => j.competitor === activeFilter);

    if (filtered.length === 0) {
        tbody.innerHTML = '<tr><td colspan="4" class="empty-state">No active job postings found.</td></tr>';
        return;
    }

    tbody.innerHTML = filtered.map(j => {
        const accent = ACCENT_COLORS[j.competitor] || "#64748b";
        return `
            <tr>
                <td><span class="competitor-dot" style="background:${accent}"></span>${escapeHTML(j.competitor_name)}</td>
                <td><a href="${escapeHTML(j.url)}" target="_blank" rel="noopener">${escapeHTML(j.title)}</a></td>
                <td>${escapeHTML(j.department || "--")}</td>
                <td>${escapeHTML(j.location || "--")}</td>
            </tr>`;
    }).join("");
}

// ---- Filter buttons ----

function bindFilters() {
    document.querySelectorAll(".filter-btn").forEach(btn => {
        btn.addEventListener("click", () => {
            document.querySelectorAll(".filter-btn").forEach(b => b.classList.remove("active"));
            btn.classList.add("active");
            activeFilter = btn.dataset.filter;
            renderSignals();
            renderJobs();
        });
    });
}

// ---- Utility ----

function escapeHTML(str) {
    if (!str) return "";
    return str.replace(/&/g, "&amp;")
              .replace(/</g, "&lt;")
              .replace(/>/g, "&gt;")
              .replace(/"/g, "&quot;");
}
