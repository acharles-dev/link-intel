const SUPABASE_URL = window.__SUPABASE_URL__ || '';
const SUPABASE_KEY = window.__SUPABASE_KEY__ || '';

let db;
let allSignals = [];
let competitors = [];
let activeCompetitor = null;
let activeType = null;

async function init() {
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    document.getElementById('signal-feed').innerHTML = '<div class="empty">Configure Supabase credentials to load data.</div>';
    return;
  }

  const { createClient } = supabase;
  db = createClient(SUPABASE_URL, SUPABASE_KEY);

  const [compResult, sigResult] = await Promise.all([
    db.from('competitors').select('*'),
    db.from('signals').select('*, competitors(name, slug, logo_emoji)').order('detected_at', { ascending: false }).limit(200),
  ]);

  competitors = compResult.data || [];
  allSignals = sigResult.data || [];

  renderStats();
  renderCompetitorChips();
  renderFilters();
  renderSignals();
}

function renderStats() {
  const el = document.getElementById('stats-bar');
  const uniqueCompanies = new Set(allSignals.map(s => s.competitor_id)).size;
  const types = {};
  allSignals.forEach(s => { types[s.signal_type] = (types[s.signal_type] || 0) + 1; });

  el.innerHTML = `
    <span class="stat"><strong>${allSignals.length}</strong> signals tracked</span>
    <span class="stat"><strong>${uniqueCompanies}</strong> competitors</span>
    <span class="stat"><strong>${types.blog || 0}</strong> blog posts</span>
    <span class="stat"><strong>${types.changelog || 0}</strong> changelog entries</span>
    <span class="stat"><strong>${types.pricing || 0}</strong> pricing changes</span>
  `;
}

function renderCompetitorChips() {
  const el = document.getElementById('competitor-chips');
  const counts = {};
  allSignals.forEach(s => {
    const name = s.competitors?.name || 'Unknown';
    counts[name] = (counts[name] || 0) + 1;
  });

  const allChip = `<span class="comp-chip active" data-slug="">All <span class="count">${allSignals.length}</span></span>`;
  const chips = competitors.map(c => {
    const count = counts[c.name] || 0;
    return `<span class="comp-chip" data-slug="${esc(c.slug)}">${esc(c.logo_emoji)} ${esc(c.name)} <span class="count">${count}</span></span>`;
  }).join('');

  el.innerHTML = allChip + chips;

  el.querySelectorAll('.comp-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      el.querySelectorAll('.comp-chip').forEach(c => c.classList.remove('active'));
      chip.classList.add('active');
      activeCompetitor = chip.dataset.slug || null;
      renderSignals();
    });
  });
}

function renderFilters() {
  const el = document.getElementById('type-filters');
  const types = ['all', 'blog', 'changelog', 'pricing', 'feature'];
  el.innerHTML = types.map(t =>
    `<button class="filter-btn ${t === 'all' ? 'active' : ''}" data-type="${t}">${t}</button>`
  ).join('');

  el.querySelectorAll('.filter-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      el.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      activeType = btn.dataset.type === 'all' ? null : btn.dataset.type;
      renderSignals();
    });
  });
}

function renderSignals() {
  const el = document.getElementById('signal-feed');
  let filtered = allSignals;

  if (activeCompetitor) {
    filtered = filtered.filter(s => s.competitors?.slug === activeCompetitor);
  }
  if (activeType) {
    filtered = filtered.filter(s => s.signal_type === activeType);
  }

  if (!filtered.length) {
    el.innerHTML = '<div class="empty">No signals yet. Run the fetch-signals Edge Function to populate data.</div>';
    return;
  }

  el.innerHTML = filtered.map(s => {
    const comp = s.competitors || {};
    const date = new Date(s.detected_at);
    const relative = timeAgo(date);

    return `
      <div class="signal">
        <span class="signal-emoji">${esc(comp.logo_emoji || '📡')}</span>
        <div class="signal-body">
          <div class="signal-meta">
            <span class="signal-company">${esc(comp.name || 'Unknown')}</span>
            <span class="signal-type ${esc(s.signal_type)}">${esc(s.signal_type)}</span>
            <span class="signal-date">${relative}</span>
          </div>
          <a class="signal-title" href="${esc(s.source_url)}" target="_blank">${esc(s.title)}</a>
          ${s.summary ? `<p class="signal-summary">${esc(s.summary)}</p>` : ''}
        </div>
      </div>
    `;
  }).join('');
}

function timeAgo(date) {
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
  if (seconds < 60) return 'just now';
  if (seconds < 3600) return Math.floor(seconds / 60) + 'm ago';
  if (seconds < 86400) return Math.floor(seconds / 3600) + 'h ago';
  if (seconds < 604800) return Math.floor(seconds / 86400) + 'd ago';
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function esc(str) {
  if (!str) return '';
  const d = document.createElement('div');
  d.textContent = str;
  return d.innerHTML;
}

document.addEventListener('DOMContentLoaded', init);
