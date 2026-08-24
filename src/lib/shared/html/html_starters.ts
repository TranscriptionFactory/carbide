export type HtmlStarter = {
  id: string;
  label: string;
  description: string;
  keywords: string[];
  source: string;
};

/* Renders themed on both token surfaces (fence previews inject shadcn tokens,
   live .html artifacts inject --carbide-* vars) and degrades to literals in a
   plain browser. Sources deliberately avoid color/background declarations so
   has_author_colors keeps fence previews on the themed path. */
const TOKEN_FALLBACK_STYLE = `<style>
  :root {
    --c-bg: var(--carbide-bg, var(--background, #ffffff));
    --c-fg: var(--carbide-fg, var(--foreground, #18181b));
    --c-accent: var(--carbide-accent, var(--primary, #2563eb));
    --c-muted: var(--carbide-muted-fg, var(--muted-foreground, #71717a));
    --c-border: var(--carbide-border, var(--border, #e4e4e7));
  }
</style>`;

const STAT_CARDS_SOURCE = `${TOKEN_FALLBACK_STYLE}
<style>
  .stat-cards .card { flex: 1 1 140px; padding: 12px 16px; border: 1px solid var(--c-border); border-top: 3px solid var(--c-accent); border-radius: var(--radius, 8px); }
  .stat-cards .label { font-size: 0.8rem; opacity: 0.72; }
  .stat-cards .value { margin: 4px 0; font-size: 1.6rem; font-weight: 700; }
</style>
<div class="stat-cards" style="display:flex;gap:12px;flex-wrap:wrap">
  <div class="card">
    <div class="label">Revenue</div>
    <div class="value">$48.2k</div>
    <div class="label">+12% vs last month</div>
  </div>
  <div class="card">
    <div class="label">Active users</div>
    <div class="value">1,284</div>
    <div class="label">+4% vs last month</div>
  </div>
  <div class="card">
    <div class="label">Open tickets</div>
    <div class="value">37</div>
    <div class="label">-9% vs last month</div>
  </div>
</div>
`;

const CHART_SOURCE = `${TOKEN_FALLBACK_STYLE}
<svg viewBox="0 0 320 168" role="img" aria-label="Bar chart" style="display:block;width:100%;height:auto">
  <line x1="12" y1="140" x2="308" y2="140" style="stroke:var(--c-border)"/>
  <rect x="26" y="96" width="36" height="44" rx="4" style="fill:var(--chart-1, var(--c-accent))"/>
  <text x="44" y="90" text-anchor="middle" style="fill:var(--c-muted);font-size:11px">44</text>
  <rect x="84" y="68" width="36" height="72" rx="4" style="fill:var(--chart-2, var(--c-accent))"/>
  <text x="102" y="62" text-anchor="middle" style="fill:var(--c-muted);font-size:11px">72</text>
  <rect x="142" y="82" width="36" height="58" rx="4" style="fill:var(--chart-3, var(--c-accent))"/>
  <text x="160" y="76" text-anchor="middle" style="fill:var(--c-muted);font-size:11px">58</text>
  <rect x="200" y="44" width="36" height="96" rx="4" style="fill:var(--chart-4, var(--c-accent))"/>
  <text x="218" y="38" text-anchor="middle" style="fill:var(--c-muted);font-size:11px">96</text>
  <rect x="258" y="60" width="36" height="80" rx="4" style="fill:var(--chart-5, var(--c-accent))"/>
  <text x="276" y="54" text-anchor="middle" style="fill:var(--c-muted);font-size:11px">80</text>
  <text x="44" y="156" text-anchor="middle" style="fill:var(--c-muted);font-size:10px">Mon</text>
  <text x="102" y="156" text-anchor="middle" style="fill:var(--c-muted);font-size:10px">Tue</text>
  <text x="160" y="156" text-anchor="middle" style="fill:var(--c-muted);font-size:10px">Wed</text>
  <text x="218" y="156" text-anchor="middle" style="fill:var(--c-muted);font-size:10px">Thu</text>
  <text x="276" y="156" text-anchor="middle" style="fill:var(--c-muted);font-size:10px">Fri</text>
</svg>
`;

const TABS_SOURCE = `${TOKEN_FALLBACK_STYLE}
<style>
  .tabset .tabs { display: flex; gap: 4px; border-bottom: 1px solid var(--c-border); }
  .tabset .tab { appearance: none; margin-bottom: -1px; padding: 8px 14px; border: 0; border-bottom: 2px solid transparent; font: inherit; opacity: 0.72; cursor: pointer; }
  .tabset .tab.active { border-bottom-color: var(--c-accent); opacity: 1; font-weight: 600; }
  .tabset .panel { display: none; padding: 12px 2px; }
  .tabset .panel.active { display: block; }
</style>
<div class="tabset">
  <div class="tabs" role="tablist">
    <button class="tab active" data-tab="one">Overview</button>
    <button class="tab" data-tab="two">Details</button>
    <button class="tab" data-tab="three">History</button>
  </div>
  <div class="panel active" data-panel="one">Overview content goes here.</div>
  <div class="panel" data-panel="two">Details content goes here.</div>
  <div class="panel" data-panel="three">History content goes here.</div>
</div>
<script>
(function () {
  var root = document.currentScript.previousElementSibling;
  var tabs = root.querySelectorAll(".tab");
  var panels = root.querySelectorAll(".panel");
  function select(tab) {
    tabs.forEach(function (t) { t.classList.toggle("active", t === tab); });
    panels.forEach(function (p) {
      p.classList.toggle("active", p.dataset.panel === tab.dataset.tab);
    });
  }
  tabs.forEach(function (t) { t.addEventListener("click", function () { select(t); }); });
})();
</script>
`;

export const HTML_EMBED_STARTERS: HtmlStarter[] = [
  {
    id: "html-stat-cards",
    label: "Stat cards",
    description: "Three KPI cards in a row with an accent edge",
    keywords: ["html", "embed", "widget", "stats", "kpi", "cards"],
    source: STAT_CARDS_SOURCE,
  },
  {
    id: "html-chart",
    label: "Bar chart",
    description: "Inline SVG bar chart themed by chart tokens",
    keywords: ["html", "embed", "widget", "chart", "viz", "bar"],
    source: CHART_SOURCE,
  },
  {
    id: "html-tabs",
    label: "Tabs",
    description: "Three-tab switcher driven by an inline script",
    keywords: ["html", "embed", "widget", "tabs", "interactive"],
    source: TABS_SOURCE,
  },
];

export const HTML_BLANK_SCAFFOLD = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>HTML artifact</title>
${TOKEN_FALLBACK_STYLE}
</head>
<body>
<p>Edit this HTML artifact.</p>
</body>
</html>
`;
