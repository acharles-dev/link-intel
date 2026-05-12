const SUPABASE_URL = window.__SUPABASE_URL__ || '';
const SUPABASE_KEY = window.__SUPABASE_KEY__ || '';

let db, allSignals = [], competitors = [];
let filterCompetitor = null, filterType = null;

async function init() {
  if (!SUPABASE_URL || !SUPABASE_KEY) return;
  const { createClient } = supabase;
  db = createClient(SUPABASE_URL, SUPABASE_KEY);

  const [c, s] = await Promise.all([
    db.from('competitors').select('*').order('name'),
    db.from('signals').select('*, competitors(name, slug, logo_emoji)')
      .order('detected_at', { ascending: false }).limit(500),
  ]);

  competitors = c.data || [];
  allSignals = s.data || [];
  render();
}

function render() {
  renderStats();
  renderControls();
  renderFeed();
}

function renderStats() {
  const el = document.getElementById('stats');
  const types = {};
  allSignals.forEach(s => types[s.signal_type] = (types[s.signal_type] || 0) + 1);
  el.innerHTML = `
    <span><strong>${allSignals.length}</strong> signals</span>
    <span><strong>${competitors.length}</strong> competitors</span>
    <span><strong>${types.blog || 0}</strong> blog</span>
    <span><strong>${types.changelog || 0}</strong> changelog</span>
  `;
}

function renderControls() {
  const el = document.getElementById('controls');
  const counts = {};
  allSignals.forEach(s => {
    const n = s.competitors?.slug || '';
    counts[n] = (counts[n] || 0) + 1;
  });

  let html = `<button class="chip ${!filterCompetitor ? 'active' : ''}" data-filter="comp" data-val="">All</button>`;
  competitors.forEach(c => {
    html += `<button class="chip ${filterCompetitor === c.slug ? 'active' : ''}" data-filter="comp" data-val="${esc(c.slug)}">${esc(c.logo_emoji || '')} ${esc(c.name)}<span class="num">${counts[c.slug] || 0}</span></button>`;
  });

  html += `<div class="separator"></div>`;
  ['blog', 'changelog', 'pricing', 'feature'].forEach(t => {
    html += `<button class="chip ${filterType === t ? 'active' : ''}" data-filter="type" data-val="${t}">${t}</button>`;
  });

  el.innerHTML = html;
  el.querySelectorAll('.chip').forEach(btn => {
    btn.addEventListener('click', () => {
      const f = btn.dataset.filter;
      const v = btn.dataset.val;
      if (f === 'comp') filterCompetitor = v || null;
      if (f === 'type') filterType = filterType === v ? null : v;
      render();
    });
  });
}

function renderFeed() {
  const el = document.getElementById('feed');
  let filtered = allSignals;
  if (filterCompetitor) filtered = filtered.filter(s => s.competitors?.slug === filterCompetitor);
  if (filterType) filtered = filtered.filter(s => s.signal_type === filterType);

  if (!filtered.length) {
    el.innerHTML = '<div class="empty">No signals match this filter.</div>';
    return;
  }

  el.innerHTML = filtered.map(s => {
    const comp = s.competitors || {};
    return `
      <div class="signal">
        <div class="signal-icon">${esc(comp.logo_emoji || '')}</div>
        <div class="signal-body">
          <div class="signal-row">
            <span class="signal-company">${esc(comp.name || '')}</span>
            <span class="badge badge-${esc(s.signal_type)}">${esc(s.signal_type)}</span>
          </div>
          <a class="signal-title" href="${esc(s.source_url)}" target="_blank" rel="noopener">${esc(s.title)}</a>
          ${s.summary ? `<div class="signal-summary">${esc(s.summary)}</div>` : ''}
        </div>
        <span class="signal-time">${timeAgo(new Date(s.detected_at))}</span>
      </div>`;
  }).join('');
}

function timeAgo(d) {
  const s = Math.floor((Date.now() - d.getTime()) / 1000);
  if (s < 60) return 'now';
  if (s < 3600) return Math.floor(s / 60) + 'm';
  if (s < 86400) return Math.floor(s / 3600) + 'h';
  if (s < 604800) return Math.floor(s / 86400) + 'd';
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function esc(s) {
  if (!s) return '';
  const d = document.createElement('div');
  d.textContent = s;
  return d.innerHTML;
}

document.addEventListener('DOMContentLoaded', init);
