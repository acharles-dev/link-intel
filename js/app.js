const SUPABASE_URL = window.__SUPABASE_URL__ || '';
const SUPABASE_KEY = window.__SUPABASE_KEY__ || '';

let db, allSignals = [], competitors = [];
let activeComp = null;

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
  let signals = allSignals;
  if (activeComp) signals = signals.filter(s => s.competitors?.slug === activeComp);

  renderStats(signals);
  renderChips();
  renderSummary(signals);
  renderTimeline(signals);
}

function renderStats(signals) {
  const now = Date.now();
  const day = 86400000;
  const recent = signals.filter(s => now - new Date(s.detected_at).getTime() < day).length;
  const week = signals.filter(s => now - new Date(s.detected_at).getTime() < 7 * day).length;

  document.getElementById('stats').innerHTML = `
    <span><strong>${signals.length}</strong> total signals</span>
    <span><strong>${competitors.length}</strong> competitors</span>
    <span><strong>${recent}</strong> last 24h</span>
    <span><strong>${week}</strong> last 7 days</span>
  `;
}

function renderChips() {
  const el = document.getElementById('chips');
  const counts = {};
  allSignals.forEach(s => {
    const slug = s.competitors?.slug || '';
    counts[slug] = (counts[slug] || 0) + 1;
  });

  let html = '';
  html += chip('All', '', !activeComp, allSignals.length);
  competitors.forEach(c => {
    html += chip(`${c.logo_emoji || ''} ${c.name}`, c.slug, activeComp === c.slug, counts[c.slug] || 0);
  });
  el.innerHTML = html;
}

function chip(label, val, active, count) {
  return `<button class="chip ${active ? 'active' : ''}" onclick="setFilter('${esc(val)}')">${label}<span class="num">${count}</span></button>`;
}

window.setFilter = function(slug) {
  activeComp = slug || null;
  render();
};

function renderSummary(signals) {
  const el = document.getElementById('summary');
  if (!signals.length) { el.innerHTML = ''; return; }

  const now = Date.now();
  const week = 7 * 86400000;
  const recent = signals.filter(s => now - new Date(s.detected_at).getTime() < week);

  // Group recent by competitor
  const byComp = {};
  recent.forEach(s => {
    const name = s.competitors?.name || 'Unknown';
    if (!byComp[name]) byComp[name] = [];
    byComp[name].push(s);
  });

  if (!recent.length) {
    el.innerHTML = '<div class="summary-box"><p class="summary-text">No new signals this week.</p></div>';
    return;
  }

  let html = '<div class="summary-box"><h3>This Week</h3>';
  for (const [name, sigs] of Object.entries(byComp)) {
    html += `<div class="summary-line"><strong>${esc(name)}</strong>: ${sigs.length} new — `;
    html += sigs.slice(0, 2).map(s => `<a href="${esc(s.source_url)}" target="_blank" rel="noopener">${esc(truncate(s.title, 50))}</a>`).join(', ');
    if (sigs.length > 2) html += ` +${sigs.length - 2} more`;
    html += '</div>';
  }
  html += '</div>';
  el.innerHTML = html;
}

function renderTimeline(signals) {
  const el = document.getElementById('timeline');
  if (!signals.length) {
    el.innerHTML = '<div class="empty">No signals yet.</div>';
    return;
  }

  // Group by date
  const groups = {};
  signals.forEach(s => {
    const d = new Date(s.detected_at);
    const key = d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
    if (!groups[key]) groups[key] = [];
    groups[key].push(s);
  });

  let html = '';
  for (const [date, sigs] of Object.entries(groups)) {
    html += `<div class="date-group">`;
    html += `<div class="date-label">${date} <span class="date-count">${sigs.length}</span></div>`;
    sigs.forEach(s => {
      const comp = s.competitors || {};
      html += `
        <div class="signal">
          <span class="signal-icon">${esc(comp.logo_emoji || '')}</span>
          <div class="signal-body">
            <span class="signal-company">${esc(comp.name || '')}</span>
            <a class="signal-title" href="${esc(s.source_url)}" target="_blank" rel="noopener">${esc(s.title)}</a>
            ${s.summary ? `<p class="signal-summary">${esc(truncate(s.summary, 150))}</p>` : ''}
          </div>
        </div>`;
    });
    html += '</div>';
  }
  el.innerHTML = html;
}

function truncate(s, n) { return s && s.length > n ? s.slice(0, n) + '...' : s; }

function esc(s) {
  if (!s) return '';
  const d = document.createElement('div');
  d.textContent = s;
  return d.innerHTML;
}

document.addEventListener('DOMContentLoaded', init);
