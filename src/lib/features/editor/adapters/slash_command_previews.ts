import type { SlashCommand } from "./slash_command_plugin";

type Attrs = Record<string, string>;

function el(
  tag: string,
  attrs: Attrs = {},
  ...children: (Node | string)[]
): HTMLElement {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (key === "class") node.className = value;
    else node.setAttribute(key, value);
  }
  for (const child of children) {
    node.append(
      typeof child === "string" ? document.createTextNode(child) : child,
    );
  }
  return node;
}

function heading_preview(level: number): () => HTMLElement {
  return () => el(`h${String(level)}`, {}, `Heading ${String(level)}`);
}

function code_preview(): HTMLElement {
  return el(
    "pre",
    {},
    el("code", {}, "const sum = (a, b) => a + b;\nconsole.log(sum(2, 3));"),
  );
}

function table_preview(): HTMLElement {
  return el(
    "table",
    {},
    el(
      "tbody",
      {},
      el(
        "tr",
        {},
        el("th", {}, el("p", {}, "Col 1")),
        el("th", {}, el("p", {}, "Col 2")),
      ),
      el(
        "tr",
        {},
        el("td", {}, el("p", {}, "A1")),
        el("td", {}, el("p", {}, "B1")),
      ),
    ),
  );
}

function bullet_list_preview(): HTMLElement {
  return el(
    "ul",
    {},
    el("li", {}, el("p", {}, "First item")),
    el("li", {}, el("p", {}, "Second item")),
  );
}

function ordered_list_preview(): HTMLElement {
  return el(
    "ol",
    {},
    el("li", {}, el("p", {}, "First item")),
    el("li", {}, el("p", {}, "Second item")),
  );
}

function task_item(text: string, checked: boolean): HTMLElement {
  return el(
    "li",
    { "data-item-type": "task", "data-checked": String(checked) },
    el("p", {}, text),
  );
}

function task_list_preview(): HTMLElement {
  return el(
    "ul",
    {},
    task_item("Write the spec", true),
    task_item("Ship the feature", false),
  );
}

function blockquote_preview(): HTMLElement {
  return el("blockquote", {}, el("p", {}, "A quoted line of text."));
}

function divider_preview(): HTMLElement {
  return el(
    "div",
    {},
    el("p", {}, "Above"),
    el("hr", {}),
    el("p", {}, "Below"),
  );
}

function math_preview(): HTMLElement {
  return el("div", { class: "SlashMenu__math" }, "a² + b² = c²");
}

function collapsible_preview(): HTMLElement {
  return el(
    "div",
    { class: "details-block", "data-open": "true" },
    el("span", { class: "details-block__toggle" }, "›"),
    el(
      "div",
      { class: "details-block__body" },
      el("summary", { class: "details-block__summary" }, "Details"),
      el(
        "div",
        { class: "details-block__content", "data-details-content": "" },
        el("p", {}, "Hidden content revealed when expanded."),
      ),
    ),
  );
}

function callout_preview(
  type: string,
  title: string,
  icon: string,
): () => HTMLElement {
  return () =>
    el(
      "div",
      {
        class: `callout-block callout-block--${type}`,
        "data-callout-type": type,
      },
      el(
        "div",
        { class: "callout-block__header" },
        el("span", { class: "callout-block__icon" }, icon),
      ),
      el(
        "div",
        { class: "callout-block__content" },
        el("div", { class: "callout-block__title" }, title),
        el(
          "div",
          { class: "callout-block__body" },
          el("p", {}, "Callout body text."),
        ),
      ),
    );
}

function mock_preview(title: string, icon: string): () => HTMLElement {
  return () => {
    const card = el("div", { class: "SlashMenu__mock" });
    card.appendChild(
      el(
        "div",
        { class: "SlashMenu__mock-head" },
        el("span", { class: "SlashMenu__mock-icon" }, icon),
        title,
      ),
    );
    for (let i = 0; i < 3; i++) {
      card.appendChild(el("div", { class: "SlashMenu__mock-row" }));
    }
    return card;
  };
}

export const PREVIEW_BUILDERS: Record<string, () => HTMLElement> = {
  h1: heading_preview(1),
  h2: heading_preview(2),
  h3: heading_preview(3),
  h4: heading_preview(4),
  h5: heading_preview(5),
  h6: heading_preview(6),
  code: code_preview,
  table: table_preview,
  bullet: bullet_list_preview,
  ordered: ordered_list_preview,
  todo: task_list_preview,
  blockquote: blockquote_preview,
  divider: divider_preview,
  math: math_preview,
  collapsible: collapsible_preview,
  "callout-note": callout_preview("note", "Note", "📝"),
  "callout-warning": callout_preview("warning", "Warning", "⚠️"),
  "callout-tip": callout_preview("tip", "Tip", "💡"),
  "callout-important": callout_preview("important", "Important", "📌"),
  "callout-example": callout_preview("example", "Example", "🧪"),
  query: mock_preview("Query results", "🔍"),
  base: mock_preview("Base view", "🗃️"),
  backlinks: mock_preview("Backlinks", "🔗"),
  "task-query": mock_preview("Task query", "✅"),
  frontmatter: mock_preview("Properties", "🏷"),
};

function build_fallback_card(cmd: SlashCommand): HTMLElement {
  return el(
    "div",
    { class: "SlashMenu__fallback" },
    el("span", { class: "SlashMenu__fallback-icon" }, cmd.icon),
    el("span", { class: "SlashMenu__fallback-label" }, cmd.label),
    el("span", { class: "SlashMenu__fallback-desc" }, cmd.description),
  );
}

function build_preview_content(cmd: SlashCommand): HTMLElement {
  if (cmd.preview) {
    try {
      const doc = el("div", { class: "ProseMirror SlashMenu__preview-doc" });
      doc.appendChild(cmd.preview());
      return doc;
    } catch {
      // Builder failed — fall through to the icon/label card.
    }
  }
  return build_fallback_card(cmd);
}

export function build_preview(
  cmd: SlashCommand,
  cache: Map<string, HTMLElement>,
): HTMLElement {
  const cached = cache.get(cmd.id);
  if (cached) return cached;
  const built = build_preview_content(cmd);
  cache.set(cmd.id, built);
  return built;
}
