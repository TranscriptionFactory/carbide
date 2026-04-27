/* global React, ReactDOM, THEMES, DENSITIES, RADIUS_MAP, I, Tree, TREE,
          TweaksPanel, useTweaks, TweakSection, TweakRadio, TweakSlider, TweakColor */
const { useState, useEffect, useMemo } = React;

const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
  "theme": "carbide",
  "scheme": "light",
  "density": "regular",
  "radius": "default",
  "accentHue": 255,
  "showOutline": true
}/*EDITMODE-END*/;

function App() {
  const [tweaks, setTweak] = useTweaks(TWEAK_DEFAULTS);
  const [activeView, setActiveView] = useState("explorer");
  const [activeFile, setActiveFile] = useState("10/carbide/redesign");
  const [openTabs, setOpenTabs] = useState([
    { path: "10/carbide/redesign", name: "ui-redesign.md", dirty: true },
    { path: "10/carbide/themes", name: "themes-design.md", dirty: false },
    { path: "00/idea", name: "Idea — token tier 4.md", dirty: false },
  ]);

  // Apply tokens to <html>
  useEffect(() => {
    const root = document.documentElement;
    root.dataset.theme = tweaks.theme;
    root.dataset.colorScheme = tweaks.scheme;
    root.dataset.density = tweaks.density;
    root.style.setProperty("--radius", RADIUS_MAP[tweaks.radius] || "6px");

    // Mirror Tier-3 affordance flags from CSS custom properties to data
    // attributes so shell.css can dispatch on [data-statusbar-shape] etc.
    const cs = getComputedStyle(root);
    const mirror = (cssVar, dataAttr) => {
      const v = cs.getPropertyValue(cssVar).trim().replace(/^"|"$/g, "");
      if (v) root.setAttribute(dataAttr, v);
    };
    mirror("--statusbar-shape",      "data-statusbar-shape");
    mirror("--tab-active-indicator", "data-tab-indicator");
    mirror("--sidebar-active-shape", "data-sidebar-active");

    // Accent hue override at semantic tier (only meaningful for themes that use blue accent)
    if (tweaks.theme === "carbide" || tweaks.theme === "cockpit") {
      const L = tweaks.scheme === "dark" ? 0.66 : 0.55;
      const C = tweaks.theme === "cockpit" ? 0.18 : 0.18;
      root.style.setProperty("--interactive", `oklch(${L} ${C} ${tweaks.accentHue})`);
      root.style.setProperty("--focus-ring", `oklch(${L} ${C} ${tweaks.accentHue})`);
      root.style.setProperty("--ring", `oklch(${L} ${C} ${tweaks.accentHue})`);
    } else {
      root.style.removeProperty("--interactive");
      root.style.removeProperty("--focus-ring");
      root.style.removeProperty("--ring");
    }
  }, [tweaks]);

  const themeMeta = THEMES.find(t => t.id === tweaks.theme);

  return (
    <div className="App" data-screen-label="01 Editor Shell">
      <TitleBar themeMeta={themeMeta} scheme={tweaks.scheme} />
      <div className="Body">
        <ActivityBar activeView={activeView} onSelect={setActiveView} />
        <Sidebar activeFile={activeFile} onSelect={(n) => setActiveFile(n.path)} />
        <Main
          tabs={openTabs}
          activeFile={activeFile}
          onSelectTab={setActiveFile}
          onCloseTab={(p) => setOpenTabs(t => t.filter(x => x.path !== p))}
          showOutline={tweaks.showOutline}
        />
      </div>
      <StatusBar theme={tweaks.theme} />
      <TweaksPanel title="Tweaks">
        <TweakSection title="Theme">
          <ThemeGrid value={tweaks.theme} onChange={(v) => {
            const meta = THEMES.find(t => t.id === v);
            const next = { theme: v };
            if (meta?.prefer) next.scheme = meta.prefer;
            setTweak(next);
          }} />
        </TweakSection>
        <TweakSection title="Appearance">
          <TweakRadio
            label="Color scheme" value={tweaks.scheme}
            onChange={(v) => setTweak("scheme", v)}
            options={[{ value: "light", label: "Light" }, { value: "dark", label: "Dark" }]}
          />
          <TweakRadio
            label="Density" value={tweaks.density}
            onChange={(v) => setTweak("density", v)}
            options={DENSITIES.map(d => ({ value: d, label: d[0].toUpperCase() + d.slice(1) }))}
          />
          <TweakRadio
            label="Radius" value={tweaks.radius}
            onChange={(v) => setTweak("radius", v)}
            options={[{ value: "sharp", label: "Sharp" }, { value: "default", label: "Default" }, { value: "soft", label: "Soft" }]}
          />
          <TweakSlider
            label="Accent hue" value={tweaks.accentHue}
            min={0} max={360} step={5} unit="°"
            onChange={(v) => setTweak("accentHue", v)}
          />
        </TweakSection>
        <TweakSection title="Layout">
          <TweakRadio
            label="Outline panel" value={tweaks.showOutline ? "on" : "off"}
            onChange={(v) => setTweak("showOutline", v === "on")}
            options={[{ value: "on", label: "Shown" }, { value: "off", label: "Hidden" }]}
          />
        </TweakSection>
      </TweaksPanel>
    </div>
  );
}

function ThemeGrid({ value, onChange }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
      {THEMES.map(t => (
        <button
          key={t.id}
          onClick={() => onChange(t.id)}
          className="ThemeCard"
          data-active={value === t.id}
          style={{
            padding: "10px 12px",
            border: `1px solid ${value === t.id ? "var(--interactive)" : "var(--border)"}`,
            background: value === t.id ? "var(--accent)" : "var(--background)",
            color: "var(--foreground)",
            borderRadius: "var(--radius-md)",
            textAlign: "left",
            display: "flex", flexDirection: "column", gap: 4,
            cursor: "pointer",
          }}
        >
          <ThemeSwatch theme={t.id} />
          <div style={{ fontSize: 12, fontWeight: 600 }}>{t.name}</div>
          <div style={{ fontSize: 11, color: "var(--foreground-tertiary)", lineHeight: 1.3 }}>{t.blurb}</div>
        </button>
      ))}
    </div>
  );
}

function ThemeSwatch({ theme }) {
  const palettes = {
    carbide:  ["oklch(1 0 0)", "oklch(0.96 0 0)", "oklch(0.18 0 0)", "oklch(0.55 0.18 255)"],
    cockpit:  ["oklch(0.16 0.01 250)", "oklch(0.22 0.014 250)", "oklch(0.92 0.01 110)", "oklch(0.72 0.18 145)"],
    paper:    ["oklch(0.985 0.012 80)", "oklch(0.95 0.016 80)", "oklch(0.22 0.01 60)", "oklch(0.40 0.10 30)"],
    terminal: ["oklch(0.10 0.005 80)", "oklch(0.13 0.008 80)", "oklch(0.85 0.16 85)", "oklch(0.75 0.18 200)"],
  }[theme] || [];
  return (
    <div style={{ display: "flex", height: 16, borderRadius: 3, overflow: "hidden", border: "1px solid var(--border-subtle)" }}>
      {palettes.map((c, i) => <div key={i} style={{ flex: 1, background: c }} />)}
    </div>
  );
}

function TitleBar({ themeMeta, scheme }) {
  return (
    <div className="TitleBar">
      <div className="TitleBar__traffic">
        <span className="TitleBar__dot" style={{ background: "oklch(0.7 0.18 25)" }} />
        <span className="TitleBar__dot" style={{ background: "oklch(0.78 0.16 80)" }} />
        <span className="TitleBar__dot" style={{ background: "oklch(0.72 0.16 145)" }} />
      </div>
      <div className="TitleBar__title">vault — <b>carbide</b> · ui-redesign.md</div>
      <div className="ThemeChip">
        <span className="ThemeChip__hint">{scheme}</span>
        <span className="ThemeChip__name">{themeMeta?.name}</span>
      </div>
    </div>
  );
}

function ActivityBar({ activeView, onSelect }) {
  const top = [
    ["explorer", I.files, "Explorer"],
    ["starred",  I.star,  "Starred"],
    ["dash",     I.dash,  "Dashboard"],
    ["tasks",    I.tasks, "Tasks"],
    ["daily",    I.cal,   "Daily"],
    ["tags",     I.tags,  "Tags"],
    ["graph",    I.graph, "Graph"],
    ["git",      I.git,   "Source control"],
  ];
  const bot = [["help", I.help, "Help"], ["settings", I.cog, "Settings"]];
  return (
    <div className="ActivityBar">
      <div className="ActivityBar__section">
        {top.map(([id, ic, lbl]) => (
          <button key={id} className={`ActivityBar__btn ${activeView === id ? "ActivityBar__btn--active" : ""}`}
                  onClick={() => onSelect(id)} aria-label={lbl} title={lbl}>{ic}</button>
        ))}
      </div>
      <div className="ActivityBar__section">
        {bot.map(([id, ic, lbl]) => (
          <button key={id} className="ActivityBar__btn" aria-label={lbl} title={lbl}>{ic}</button>
        ))}
      </div>
    </div>
  );
}

function Sidebar({ activeFile, onSelect }) {
  return (
    <div className="Sidebar">
      <div className="Sidebar__header">
        <span>Explorer</span>
        <div className="Sidebar__header__actions">
          <button className="IconBtn" title="New file">{I.plus}</button>
          <button className="IconBtn" title="Search">{I.search}</button>
          <button className="IconBtn" title="More">{I.more}</button>
        </div>
      </div>
      <div className="Sidebar__crumbs">
        <span>~/vaults/</span><b>carbide</b>
      </div>
      <div className="Sidebar__tree">
        <Tree items={TREE} activePath={activeFile} onSelect={onSelect} />
      </div>
    </div>
  );
}

function Main({ tabs, activeFile, onSelectTab, onCloseTab, showOutline }) {
  return (
    <div className="Main">
      <div className="TabBar">
        {tabs.map(t => (
          <div key={t.path} className={`Tab ${t.path === activeFile ? "Tab--active" : ""}`} onClick={() => onSelectTab(t.path)}>
            {t.dirty && <span className="Tab__dot" />}
            <span className="Tab__name">{t.name}</span>
            <button className="Tab__close" onClick={(e) => { e.stopPropagation(); onCloseTab(t.path); }}>{I.x}</button>
          </div>
        ))}
        <div className="TabBar__spacer" />
        <div className="TabBar__actions">
          <button className="IconBtn">{I.plus}</button>
          <button className="IconBtn">{I.more}</button>
        </div>
      </div>
      <div className="MainCols">
        <div className="Editor">
          <article className="Editor__inner">
            <h1 className="Editor__title">UI redesign — token architecture</h1>
            <div className="Editor__meta">
              <span><b>tags:</b> <span className="tag">design</span> <span className="tag">tokens</span></span>
              <span><b>created:</b> 2026-04-22</span>
              <span><b>links:</b> 7</span>
            </div>
            <p>
              Carbide ships <b>20+ themes</b> today, but they all override the same flat surface of CSS variables.
              The new system splits tokens into three tiers so a theme can swap a single layer
              — say, the <code>--font-ui</code> primitive — and ripple through every component without touching colors.
            </p>
            <h2>Tiers</h2>
            <ol>
              <li><b>Primitives</b> — palette, scale, motion, type</li>
              <li><b>Semantic</b> — <code>--background</code>, <code>--foreground</code>, <code>--border</code>, <code>--interactive</code></li>
              <li><b>Component</b> — <code>--sidebar-*</code>, <code>--editor-*</code>, <code>--tab-*</code>, <code>--statusbar-*</code></li>
            </ol>
            <h2>Goals</h2>
            <ul>
              <li>Themes can be radically different feels — see <a className="wikilink">[[Terminal Phosphor]]</a></li>
              <li>Tweak axes (density, radius, accent hue) compose with any theme</li>
              <li>Existing shadcn token names stay valid at the semantic tier</li>
            </ul>
            <h2>Density</h2>
            <p>
              A single <code>--density</code> multiplier scales chrome heights:
              activity bar, status bar, tab bar, row height. Type stays fixed so reading
              isn't disrupted; only padding shifts.
            </p>
            <pre><code>{`:root[data-density="airy"]    { --density: 1.18; }
:root[data-density="regular"] { --density: 1;    }
:root[data-density="compact"] { --density: 0.85; }`}</code></pre>
            <h2>Open questions</h2>
            <blockquote>Should component-tier tokens be opt-in per surface, or always declared?
              Leaning opt-in — most themes won't touch them.</blockquote>
            <ul>
              <li><input type="checkbox" defaultChecked /> Migrate existing themes to new tier names</li>
              <li><input type="checkbox" /> Document override surface per tier</li>
              <li><input type="checkbox" /> Add lint rule blocking primitive use in components</li>
            </ul>
            <hr />
            <p style={{ color: "var(--foreground-tertiary)", fontSize: "var(--text-sm)" }}>
              See also: <a className="wikilink">[[token-spec]]</a>, <a className="wikilink">[[theme-author-guide]]</a>
            </p>
          </article>
        </div>
        {showOutline && (
          <div className="Outline">
            <div className="Outline__head">Outline</div>
            <div className="Outline__list">
              <div className="Outline__item Outline__item--active">UI redesign — token architecture</div>
              <div className="Outline__item Outline__item--lvl2">Tiers</div>
              <div className="Outline__item Outline__item--lvl2">Goals</div>
              <div className="Outline__item Outline__item--lvl2">Density</div>
              <div className="Outline__item Outline__item--lvl2">Open questions</div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function StatusBar({ theme }) {
  if (theme === "cockpit") {
    return (
      <div className="StatusBar">
        <div className="StatusBar__group StatusBar__group--mode"><b>NORMAL</b></div>
        <div className="StatusBar__group StatusBar__group--git">{I.git}<b>main</b> ↑2 ↓0</div>
        <div className="StatusBar__group">utf-8</div>
        <div className="StatusBar__group">markdown</div>
        <div className="StatusBar__group">spaces:2</div>
        <div className="StatusBar__sep" />
        <div className="StatusBar__group">{I.err}<b>0</b> errors</div>
        <div className="StatusBar__group">Ln <b>42</b>, Col <b>17</b></div>
        <div className="StatusBar__group"><b>1,284</b> words</div>
        <div className="StatusBar__group">⌘K omni</div>
      </div>
    );
  }
  if (theme === "terminal") {
    return (
      <div className="StatusBar">
        <div className="StatusBar__group">[<b>NRM</b>]</div>
        <div className="StatusBar__group">{I.git}<b>main</b></div>
        <div className="StatusBar__group">~/carbide</div>
        <div className="StatusBar__sep" />
        <div className="StatusBar__group">42:17</div>
        <div className="StatusBar__group"><b>1284</b>w</div>
      </div>
    );
  }
  // carbide / paper
  return (
    <div className="StatusBar">
      <div className="StatusBar__group">{I.git}<b>main</b></div>
      <div className="StatusBar__group">3 sources</div>
      <div className="StatusBar__sep" />
      <div className="StatusBar__group"><b>1,284</b> words</div>
      <div className="StatusBar__group">Ln 42 · Col 17</div>
      <div className="StatusBar__group">{I.bell}</div>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(<App />);
