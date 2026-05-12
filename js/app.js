const SUPABASE_URL = window.__SUPABASE_URL__ || '';
const SUPABASE_KEY = window.__SUPABASE_KEY__ || '';

let db, signals = [], competitors = [], jobs = [];
let currentView = 'digest';
let selectedComp = null;

// Static competitive intelligence (updated manually or via scraping)
const INTEL = {
  bitly: {
    tagline: 'Connections Platform',
    positioning: 'Enterprise link management with QR codes, landing pages, and analytics. Targeting large orgs and agencies.',
    pricing: [
      {name:'Free',price:'$0',links:'10/mo'},
      {name:'Core',price:'$10/mo',links:'100/mo'},
      {name:'Growth',price:'$29/mo',links:'500/mo'},
      {name:'Premium',price:'$199/mo',links:'3K/mo'},
      {name:'Enterprise',price:'Custom',links:'Unlimited'},
    ],
  },
  dub: {
    tagline: 'Links that mean more',
    positioning: 'Open-source link management with conversion tracking and affiliate programs. Developer-first PLG motion.',
    pricing: [
      {name:'Free',price:'$0',links:'25/mo'},
      {name:'Pro',price:'$25/mo',links:'1K/mo'},
      {name:'Business',price:'$75/mo',links:'5K/mo'},
      {name:'Enterprise',price:'Custom',links:'Unlimited'},
    ],
  },
  shortio: {
    tagline: 'Short links, big results',
    positioning: 'Developer-friendly URL shortener with strong API, white-label options, and bot detection.',
    pricing: [
      {name:'Free',price:'$0',links:'1K/mo'},
      {name:'Hobby',price:'$19/mo',links:'10K/mo'},
      {name:'Pro',price:'$29/mo',links:'50K/mo'},
      {name:'Team',price:'$48/mo',links:'200K/mo'},
      {name:'Enterprise',price:'Custom',links:'Unlimited'},
    ],
  },
  tinyurl: {
    tagline: 'Shorten your links',
    positioning: 'Simple mass-market URL shortener. Consumer-friendly, limited analytics and enterprise features.',
    pricing: [
      {name:'Free',price:'$0',links:'5/mo'},
      {name:'Pro',price:'$13/mo',links:'1K/mo'},
      {name:'Bulk',price:'$99/mo',links:'100K/mo'},
    ],
  },
  rebrandly: {
    tagline: 'The link management platform',
    positioning: 'Brand-first link management with conversion tracking, custom domains, and team collaboration.',
    pricing: [
      {name:'Free',price:'$0',links:'10/mo'},
      {name:'Essentials',price:'$14/mo',links:'250/mo'},
      {name:'Professional',price:'$69/mo',links:'1.5K/mo'},
      {name:'Enterprise',price:'Custom',links:'Unlimited'},
    ],
  },
  sniply: {
    tagline: 'Add a CTA to every link',
    positioning: 'Content curation with CTA overlays on shared third-party links. No free tier.',
    pricing: [
      {name:'Basic',price:'$9/mo',links:'500/mo'},
      {name:'Pro',price:'$29/mo',links:'2K/mo'},
      {name:'Business',price:'$59/mo',links:'5K/mo'},
      {name:'Agency',price:'$149/mo',links:'20K/mo'},
    ],
  },
};

async function init() {
  if (!SUPABASE_URL || !SUPABASE_KEY) return;
  const { createClient } = supabase;
  db = createClient(SUPABASE_URL, SUPABASE_KEY);

  const [s, c, j] = await Promise.all([
    db.from('signals').select('*, competitors(name, slug, logo_emoji)').order('detected_at', { ascending: false }).limit(500),
    db.from('competitors').select('*').order('name'),
    db.from('job_postings').select('*, competitors(name, slug)').eq('is_active', true).order('first_seen', { ascending: false }),
  ]);

  signals = s.data || [];
  competitors = c.data || [];
  jobs = j.data || [];

  renderCompNav();
  switchView('digest');
}

function renderCompNav() {
  const el = document.getElementById('comp-nav');
  el.innerHTML = competitors.map(c =>
    `<div class="comp-link" onclick="showCompetitor('${esc(c.slug)}')">`+
    `<span class="dot"></span>${esc(c.logo_emoji||'')} ${esc(c.name)}</div>`
  ).join('');
}

window.switchView = function(view) {
  currentView = view;
  selectedComp = null;
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
  document.querySelector(`.nav-btn[onclick*="${view}"]`)?.classList.add('active');

  if (view === 'digest') renderDigest();
  else if (view === 'pricing') renderPricing();
  else if (view === 'competitors') renderCompetitorList();
  else if (view === 'hiring') renderHiring();
  else if (view === 'timeline') renderTimeline();
};

window.showCompetitor = function(slug) {
  selectedComp = slug;
  renderCompProfile(slug);
};

// ── DIGEST VIEW ──
function renderDigest() {
  const main = document.getElementById('main');
  const now = Date.now();
  const day = 86400000;

  const today = signals.filter(s => now - new Date(s.detected_at).getTime() < day);
  const week = signals.filter(s => now - new Date(s.detected_at).getTime() < 7*day);
  const highSeverity = week.filter(s => (s.severity || 2) >= 4);

  let html = `
    <div class="view-header"><h1>Daily Digest</h1><p>Competitive intelligence summary</p></div>
    <div class="stats-row">
      <div class="stat-card highlight"><div class="val">${highSeverity.length}</div><div class="lbl">High Priority</div></div>
      <div class="stat-card"><div class="val">${today.length}</div><div class="lbl">Today</div></div>
      <div class="stat-card"><div class="val">${week.length}</div><div class="lbl">This Week</div></div>
      <div class="stat-card"><div class="val">${jobs.length}</div><div class="lbl">Open Roles</div></div>
    </div>`;

  if (highSeverity.length) {
    html += `<div class="section-header">High Priority Signals</div>`;
    html += highSeverity.map(signalCard).join('');
  }

  // Group today's signals by competitor
  const byComp = {};
  week.forEach(s => {
    const name = s.competitors?.name || 'Unknown';
    if (!byComp[name]) byComp[name] = [];
    byComp[name].push(s);
  });

  if (Object.keys(byComp).length) {
    html += `<div class="section-header">This Week by Competitor</div>`;
    for (const [name, sigs] of Object.entries(byComp)) {
      html += `<div style="margin-bottom:16px">`;
      html += `<div style="font-weight:600;font-size:0.82rem;padding:8px 0 4px">${esc(name)} <span style="color:var(--dim);font-weight:400">${sigs.length} signals</span></div>`;
      html += sigs.slice(0, 5).map(signalCard).join('');
      if (sigs.length > 5) html += `<div style="color:var(--dim);font-size:0.75rem;padding:4px 16px">+${sigs.length-5} more</div>`;
      html += `</div>`;
    }
  }

  if (!week.length) html += `<div class="empty">No signals this week. Run the collectors to populate data.</div>`;
  main.innerHTML = html;
}

// ── PRICING MATRIX ──
function renderPricing() {
  const main = document.getElementById('main');
  let html = `<div class="view-header"><h1>Pricing Matrix</h1><p>Current pricing across all competitors</p></div>`;

  // Get all tier names across all competitors
  const allTiers = new Set();
  competitors.forEach(c => {
    const pd = INTEL[c.slug];
    if (pd?.pricing) pd.pricing.forEach(t => allTiers.add(t.name));
  });
  const tierOrder = ['Free', 'Basic', 'Essentials', 'Starter', 'Core', 'Hobby', 'Pro', 'Professional', 'Growth', 'Business', 'Team', 'Premium', 'Bulk', 'Agency', 'Enterprise'];
  const tiers = tierOrder.filter(t => allTiers.has(t));

  // Pricing comparison table
  html += `<div style="overflow-x:auto"><table style="width:100%;border-collapse:collapse;font-size:0.78rem">`;
  html += `<thead><tr style="border-bottom:2px solid var(--border)"><th style="text-align:left;padding:10px 12px;color:var(--dim)">Competitor</th>`;
  tiers.forEach(t => { html += `<th style="text-align:center;padding:10px 8px;color:var(--dim)">${esc(t)}</th>`; });
  html += `</tr></thead><tbody>`;

  competitors.forEach(c => {
    const pd = INTEL[c.slug];
    if (!pd?.pricing) return;
    const tierMap = {};
    pd.pricing.forEach(t => { tierMap[t.name] = t; });

    html += `<tr style="border-bottom:1px solid var(--border)">`;
    html += `<td style="padding:10px 12px;font-weight:600">${esc(c.logo_emoji||'')} ${esc(c.name)}</td>`;
    tiers.forEach(t => {
      const tier = tierMap[t];
      if (tier) {
        html += `<td style="text-align:center;padding:10px 8px"><div style="font-weight:600;color:var(--text)">${esc(tier.price)}</div><div style="font-size:0.65rem;color:var(--dim)">${esc(tier.links||'')}</div></td>`;
      } else {
        html += `<td style="text-align:center;padding:10px 8px;color:var(--border)">—</td>`;
      }
    });
    html += `</tr>`;
  });
  html += `</tbody></table></div>`;

  // Positioning comparison
  html += `<div class="section-header" style="margin-top:24px">Positioning & Messaging</div>`;
  competitors.forEach(c => {
    const ci = INTEL[c.slug];
    if (!ci) return;
    html += `<div class="signal-card" style="margin-bottom:8px">
      <div style="font-weight:600;font-size:0.85rem">${esc(c.logo_emoji||'')} ${esc(c.name)}</div>
      ${ci.tagline ? `<div style="font-size:0.8rem;color:var(--accent);margin-top:4px">"${esc(ci.tagline)}"</div>` : ''}
      ${ci.positioning ? `<div style="font-size:0.75rem;color:var(--dim);margin-top:4px">${esc(ci.positioning)}</div>` : ''}
    </div>`;
  });

  // Pricing change signals
  const pricingSignals = signals.filter(s => s.signal_type === 'pricing');
  if (pricingSignals.length) {
    html += `<div class="section-header">Pricing Changes</div>`;
    html += pricingSignals.map(signalCard).join('');
  }

  main.innerHTML = html;
}

// ── COMPETITOR LIST ──
function renderCompetitorList() {
  const main = document.getElementById('main');
  let html = `<div class="view-header"><h1>Competitors</h1><p>${competitors.length} tracked</p></div>`;
  html += `<div class="comp-grid">`;
  competitors.forEach(c => {
    const sigs = signals.filter(s => s.competitors?.slug === c.slug);
    const cJobs = jobs.filter(j => j.competitors?.slug === c.slug);
    const recent = sigs.filter(s => Date.now() - new Date(s.detected_at).getTime() < 7*86400000);
    html += `
      <div class="signal-card" style="cursor:pointer" onclick="showCompetitor('${esc(c.slug)}')">
        <div style="font-size:1.5rem;margin-bottom:8px">${esc(c.logo_emoji||'')}</div>
        <div style="font-size:1rem;font-weight:600">${esc(c.name)}</div>
        <div style="font-size:0.75rem;color:var(--dim);margin-top:6px">
          ${sigs.length} total signals · ${recent.length} this week · ${cJobs.length} open roles
        </div>
      </div>`;
  });
  html += `</div>`;
  main.innerHTML = html;
}

// ── COMPETITOR PROFILE ──
function renderCompProfile(slug) {
  const comp = competitors.find(c => c.slug === slug);
  if (!comp) return;
  const main = document.getElementById('main');
  const ci = INTEL[slug];
  const sigs = signals.filter(s => s.competitors?.slug === slug);
  const cJobs = jobs.filter(j => j.competitors?.slug === slug);

  let html = `
    <div class="comp-header">
      <div class="comp-emoji">${esc(comp.logo_emoji||'')}</div>
      <div class="comp-info">
        <h2>${esc(comp.name)}</h2>
        <p><a href="${esc(comp.website)}" target="_blank" style="color:var(--accent)">${esc(comp.website)}</a></p>
        ${ci?.tagline ? `<p style="margin-top:4px;color:var(--accent);font-size:0.82rem">"${esc(ci.tagline)}"</p>` : ''}
      </div>
    </div>
    ${ci?.positioning ? `<div style="background:var(--surface);border:1px solid var(--border);border-radius:var(--radius);padding:12px 16px;margin-bottom:16px;font-size:0.8rem;color:var(--dim)">${esc(ci.positioning)}</div>` : ''}
    <div class="stats-row">
      <div class="stat-card"><div class="val">${sigs.length}</div><div class="lbl">Total Signals</div></div>
      <div class="stat-card"><div class="val">${cJobs.length}</div><div class="lbl">Open Roles</div></div>
      <div class="stat-card"><div class="val">${sigs.filter(s=>(s.severity||2)>=4).length}</div><div class="lbl">High Priority</div></div>
    </div>`;

  // Pricing tiers
  if (ci?.pricing) {
    html += `<div class="section-header">Pricing</div><div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:16px">`;
    ci.pricing.forEach(t => {
      html += `<div style="background:var(--surface);border:1px solid var(--border);border-radius:var(--radius);padding:10px 14px;min-width:100px;text-align:center">
        <div style="font-size:0.65rem;color:var(--dim)">${esc(t.name)}</div>
        <div style="font-size:1rem;font-weight:700">${esc(t.price)}</div>
        ${t.links ? `<div style="font-size:0.65rem;color:var(--dim)">${esc(t.links)}</div>` : ''}
      </div>`;
    });
    html += `</div>`;
  }

  if (comp.pricing_url) {
    html += `<div style="margin-bottom:16px"><a href="${esc(comp.pricing_url)}" target="_blank" style="color:var(--accent);font-size:0.8rem">View pricing page →</a></div>`;
  }

  if (cJobs.length) {
    html += `<div class="section-header">Open Positions (${cJobs.length})</div>`;
    html += cJobs.map(j => `
      <div class="job-card">
        <div class="job-title"><a href="${esc(j.url)}" target="_blank">${esc(j.title)}</a></div>
        <div class="job-meta">${esc(j.department||'')} · ${esc(j.location||'')}</div>
      </div>`).join('');
  }

  html += `<div class="section-header">Recent Signals</div>`;
  html += sigs.length ? sigs.map(signalCard).join('') : '<div class="empty">No signals yet.</div>';

  main.innerHTML = html;
}

// ── HIRING RADAR ──
function renderHiring() {
  const main = document.getElementById('main');
  let html = `<div class="view-header"><h1>Hiring Radar</h1><p>${jobs.length} open roles across ${competitors.length} competitors</p></div>`;

  // Group jobs by competitor
  const byComp = {};
  jobs.forEach(j => {
    const name = j.competitors?.name || 'Unknown';
    if (!byComp[name]) byComp[name] = [];
    byComp[name].push(j);
  });

  if (!jobs.length) {
    html += `<div class="empty">No job postings collected yet. Run the collect-jobs function.</div>`;
    main.innerHTML = html;
    return;
  }

  html += `<div class="stats-row">`;
  const sorted = Object.entries(byComp).sort((a,b) => b[1].length - a[1].length);
  sorted.forEach(([name, j]) => {
    html += `<div class="stat-card"><div class="val">${j.length}</div><div class="lbl">${esc(name)}</div></div>`;
  });
  html += `</div>`;

  html += `<div class="hiring-grid">`;
  sorted.forEach(([name, compJobs]) => {
    // Group by department
    const byDept = {};
    compJobs.forEach(j => {
      const dept = j.department || 'Other';
      if (!byDept[dept]) byDept[dept] = 0;
      byDept[dept]++;
    });
    const maxCount = Math.max(...Object.values(byDept));

    html += `<div class="hiring-card"><h3>${esc(name)} <span style="color:var(--dim);font-weight:400">${compJobs.length}</span></h3>`;
    Object.entries(byDept).sort((a,b) => b[1]-a[1]).forEach(([dept, count]) => {
      const width = Math.max(20, (count / maxCount) * 120);
      html += `<div class="hiring-bar"><span class="dept">${esc(dept)}</span><div class="bar" style="width:${width}px"></div><span class="count">${count}</span></div>`;
    });
    html += `</div>`;
  });
  html += `</div>`;

  // All jobs list
  html += `<div class="section-header">All Open Roles</div>`;
  jobs.forEach(j => {
    html += `<div class="job-card">
      <div class="job-title"><a href="${esc(j.url)}" target="_blank">${esc(j.competitors?.name||'')}: ${esc(j.title)}</a></div>
      <div class="job-meta">${esc(j.department||'')} · ${esc(j.location||'')}</div>
    </div>`;
  });

  main.innerHTML = html;
}

// ── TIMELINE ──
function renderTimeline() {
  const main = document.getElementById('main');
  let html = `<div class="view-header"><h1>All Signals</h1><p>${signals.length} total</p></div>`;

  // Group by date
  const groups = {};
  signals.forEach(s => {
    const d = new Date(s.detected_at);
    const key = d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
    if (!groups[key]) groups[key] = [];
    groups[key].push(s);
  });

  for (const [date, sigs] of Object.entries(groups)) {
    html += `<div class="section-header">${date} <span style="font-weight:400">${sigs.length} signals</span></div>`;
    html += sigs.map(signalCard).join('');
  }

  if (!signals.length) html += `<div class="empty">No signals yet.</div>`;
  main.innerHTML = html;
}

// ── SHARED ──
function signalCard(s) {
  const comp = s.competitors || {};
  const sev = s.severity || 2;
  return `
    <div class="signal-card severity-${sev}">
      <div class="signal-row">
        <span class="signal-icon">${esc(comp.logo_emoji||'')}</span>
        <span class="signal-comp">${esc(comp.name||'')}</span>
        <span class="badge badge-${esc(s.signal_type)}">${esc(s.signal_type)}</span>
        <span style="margin-left:auto;font-size:0.68rem;color:var(--dim)">${timeAgo(new Date(s.detected_at))}</span>
      </div>
      <div class="signal-title"><a href="${esc(s.source_url)}" target="_blank" rel="noopener">${esc(s.title)}</a></div>
      ${s.summary ? `<div class="signal-summary">${esc(s.summary)}</div>` : ''}
    </div>`;
}

function timeAgo(d) {
  const s = Math.floor((Date.now() - d.getTime()) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return Math.floor(s/60) + 'm ago';
  if (s < 86400) return Math.floor(s/3600) + 'h ago';
  if (s < 604800) return Math.floor(s/86400) + 'd ago';
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function esc(s) {
  if (!s) return '';
  const d = document.createElement('div');
  d.textContent = s;
  return d.innerHTML;
}

document.addEventListener('DOMContentLoaded', init);
