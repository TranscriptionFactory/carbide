/* global React, I */
const { useState: useS } = React;

function Tree({ items, activePath, onSelect, depth = 0 }) {
  return items.map((it) => <TreeNode key={it.path} node={it} depth={depth} activePath={activePath} onSelect={onSelect} />);
}
function TreeNode({ node, depth, activePath, onSelect }) {
  const [open, setOpen] = useS(node.open ?? true);
  const isFolder = !!node.children;
  const isActive = node.path === activePath;
  const padCls = depth === 0 ? "" : depth === 1 ? "TreeRow--child" : "TreeRow--child2";
  return (
    <>
      <div
        className={`TreeRow ${padCls} ${isActive ? "TreeRow--active" : ""}`}
        onClick={() => isFolder ? setOpen(!open) : onSelect?.(node)}
      >
        {isFolder ? (
          <span className="TreeRow__chev" style={{ transform: open ? "rotate(90deg)" : "none", transition: "transform var(--duration-fast) var(--ease-default)" }}>{I.chev}</span>
        ) : (
          <span className="TreeRow__chev" style={{ visibility: "hidden" }}>{I.chev}</span>
        )}
        <span className="TreeRow__icon">{isFolder ? I.folder : I.doc}</span>
        <span>{node.name}</span>
        {node.count != null && <span className="TreeRow__count">{node.count}</span>}
      </div>
      {isFolder && open && <Tree items={node.children} activePath={activePath} onSelect={onSelect} depth={depth + 1} />}
    </>
  );
}

const TREE = [
  { path: "00", name: "00 — Inbox", children: [
    { path: "00/quick", name: "Quick capture.md" },
    { path: "00/idea", name: "Idea — token tier 4.md" },
  ]},
  { path: "10", name: "10 — Projects", children: [
    { path: "10/carbide", name: "Carbide", open: true, children: [
      { path: "10/carbide/themes", name: "themes-design.md" },
      { path: "10/carbide/redesign", name: "ui-redesign.md", active: true },
      { path: "10/carbide/plugins", name: "plugin-system.md" },
      { path: "10/carbide/release", name: "release-1.27.md" },
    ]},
    { path: "10/wiki", name: "Wiki engine" },
  ]},
  { path: "20", name: "20 — Areas", children: [
    { path: "20/research", name: "Research" },
    { path: "20/reading", name: "Reading list" },
  ]},
  { path: "30", name: "30 — Resources" },
  { path: "40", name: "40 — Archive" },
  { path: "daily", name: "Daily notes", count: 412 },
  { path: "tasks", name: "Tasks.query", count: 28 },
];

window.Tree = Tree;
window.TREE = TREE;
