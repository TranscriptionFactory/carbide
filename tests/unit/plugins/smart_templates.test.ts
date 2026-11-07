/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import * as logic from "../../../plugins/smart-templates/smart_templates_logic.js";

const html = readFileSync("plugins/smart-templates/index.html", "utf8");
const vendor = readFileSync(
  "plugins/smart-templates/vendor/handlebars.min.js",
  "utf8",
);
const plugin_script =
  html.match(/<script type="module">([\s\S]*?)<\/script>/)?.[1] ?? "";
if (!plugin_script) throw new Error("Missing template module");

function required_element(selector: string) {
  const element = document.querySelector<HTMLElement>(selector);
  if (!element) throw new Error(`Missing ${selector}`);
  return element;
}

function make_api() {
  const files = new Map<string, string>();
  const settings = new Map<string, unknown>();
  return {
    files,
    settings_values: settings,
    editor: {
      getInfo: vi
        .fn()
        .mockResolvedValue({ name: "First.md", path: "First.md" }),
      getSelection: vi.fn().mockResolvedValue("first selection"),
      replaceSelection: vi.fn().mockResolvedValue(undefined),
      getValue: vi.fn().mockResolvedValue("From current note"),
    },
    metadata: {
      getFileCache: vi
        .fn()
        .mockResolvedValue({ frontmatter: { author: ["Alice", "string"] } }),
      getBacklinks: vi.fn().mockResolvedValue([{ path: "R&D.md" }]),
    },
    vault: {
      list: vi.fn(async () => [...files.keys()]),
      read: vi.fn(async (path: string) => files.get(path)),
      create: vi.fn(async (path: string, content: string) => {
        files.set(path, content);
      }),
      modify: vi.fn(async (path: string, content: string) => {
        files.set(path, content);
      }),
    },
    actions: { execute: vi.fn().mockResolvedValue(undefined) },
    settings: {
      get: vi.fn(async (key: string) => settings.get(key)),
      set: vi.fn(async (key: string, value: unknown) => {
        settings.set(key, value);
      }),
      registerTab: vi.fn().mockResolvedValue(undefined),
    },
    commands: { register: vi.fn().mockResolvedValue(undefined) },
    ui: { addSidebarPanel: vi.fn().mockResolvedValue(undefined) },
    onload: vi.fn(),
  };
}

function load_engine() {
  window.eval(vendor);
  return logic.create_renderer(
    (
      window as unknown as {
        Handlebars: Parameters<typeof logic.create_renderer>[0];
        carbide: ReturnType<typeof make_api>;
      }
    ).Handlebars,
  );
}

async function settle() {
  for (let i = 0; i < 30; i++) await Promise.resolve();
}

async function load_panel(api = make_api(), surface = "panel") {
  vi.useFakeTimers();
  history.replaceState(null, "", `/?surface=${surface}`);
  document.documentElement.innerHTML = html.replace(
    /<script[\s\S]*?<\/script>/g,
    "",
  );
  window.eval(vendor);
  const listeners: Array<(event: MessageEvent) => unknown> = [];
  const add_listener = window.addEventListener.bind(window);
  const spy = vi.spyOn(window, "addEventListener").mockImplementation(((
    type: string,
    listener: EventListenerOrEventListenerObject,
    options?: boolean | AddEventListenerOptions,
  ) => {
    if (type === "message" && typeof listener === "function")
      listeners.push(listener as (event: MessageEvent) => unknown);
    else add_listener(type, listener, options);
  }) as typeof window.addEventListener);
  (
    window as unknown as {
      Handlebars: Parameters<typeof logic.create_renderer>[0];
      carbide: ReturnType<typeof make_api>;
    }
  ).carbide = api;
  const source = plugin_script.replace(
    /import\s*\{[\s\S]*?\}\s*from\s*"\.\/smart_templates_logic.js";/,
    "",
  );
  const bindings = { ...logic, persist_template: logic.save_template };
  window.Function(...Object.keys(bindings), source)(...Object.values(bindings));
  spy.mockRestore();
  const initialize = api.onload.mock.calls.at(-1)?.[0] as unknown as () => void;
  initialize();
  await settle();
  const element = <T extends HTMLElement = HTMLElement>(id: string) => {
    const result = document.getElementById(id);
    if (!result) throw new Error(`Missing ${id}`);
    return result as T;
  };
  return {
    api,
    element,
    click: async (id: string) => {
      element(id).click();
      await settle();
    },
    key: async (id: string, key: string) => {
      element(id).dispatchEvent(
        new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }),
      );
      await settle();
    },
    command: async (id: string) => {
      for (const listener of listeners)
        await listener(
          new MessageEvent("message", {
            data: {
              method: "command.execute",
              params: [`smart-templates:${id}`],
            },
            source: window.parent,
          }),
        );
      await settle();
    },
    message: async (data: unknown) => {
      for (const listener of listeners)
        await listener(
          new MessageEvent("message", { data, source: window.parent }),
        );
    },
  };
}

afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.restoreAllMocks();
  document.documentElement.removeAttribute("style");
  document.body.innerHTML = "";
});

describe("Smart Templates rendering", () => {
  it("renders defaults, this paths, raw markdown, and typed frontmatter values", async () => {
    const api = make_api();
    const render = load_engine();
    const context = await logic.gather_context(api);
    expect(
      render(
        '{{default missing "x"}}|{{#each backlinks}}{{this.path}}{{/each}}|{{fileCache.frontmatter.author}}',
        context,
      ),
    ).toBe("x|R&D.md|Alice");
    expect(render("{{current_note.name}} {{selection.text}}", context)).toBe(
      "First first selection",
    );
  });

  it("supports nested blocks, else-if, subexpressions, and collection helpers", () => {
    const render = load_engine();
    expect(
      render(
        '{{#if (eq value "a")}}A{{else if (eq value "b")}}{{#each (reverse (split words ","))}}{{this}}{{/each}}{{else}}C{{/if}}',
        { value: "b", words: "x,y" },
      ),
    ).toBe("yx");
    expect(
      render('{{#if (contains words "z")}}bad{{else}}ok{{/if}}', {
        words: "abc",
      }),
    ).toBe("ok");
    expect(() => render("{{#if value}}broken", {})).toThrow();
    expect(render("{{{value}}}|{{value}}", { value: "R&D <text>" })).toBe(
      "R&D <text>|R&D <text>",
    );
  });

  it("ports all thirty-one helpers and formats dates without replacing month-name letters", () => {
    const render = load_engine();
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 2, 4, 13, 5, 6));
    expect(render('{{date "MMMM dddd YYYY-MM-DD"}}|{{time}}', {})).toBe(
      "March Wednesday 2026-03-04|13:05",
    );
    const cases: Array<[string, string]> = [
      [
        "{{eq 1 1}} {{ne 1 2}} {{gt 2 1}} {{gte 2 2}} {{lt 1 2}} {{lte 2 2}}",
        "true true true true true true",
      ],
      [
        '{{uppercase "ab"}} {{lowercase "CD"}} {{truncate "long" 2}} {{slugify "你好 World"}}',
        "AB cd lo... 你好-world",
      ],
      [
        '{{default missing "x"}}|{{trim " x "}}|{{replace "aba" "a" "z"}}|{{concat "a" "b"}}|{{contains "abc" "b"}}',
        "x|x|zbz|ab|true",
      ],
      [
        '{{join (split "a,b" ",") ";"}}|{{first items}}|{{last items}}|{{length items}}|{{join (reverse items)}}|{{join (sort items)}}|{{join (uniq items)}}',
        "a;b|b|b|3|b, a, b|a, b, b|b, a",
      ],
      [
        "{{add 2 3}} {{sub 4 1}} {{mul 2 3}} {{div 6 2}} {{mod 5 2}} {{round 1.234 2}}",
        "5 3 6 3 1 1.23",
      ],
    ];
    for (const [source, expected] of cases)
      expect(render(source, { items: ["b", "a", "b"] })).toBe(expected);
    expect(render("{{div 1 0}} {{mod 1 0}}", {})).toBe("0 0");
  });

  it("refreshes note and selection on every insert and never uses a previous preview", async () => {
    const api = make_api();
    const render = load_engine();
    await logic.insert_template(
      api,
      render,
      "{{current_note.name}}: {{selection.text}}",
    );
    api.editor.getInfo.mockResolvedValue({
      name: "Second.md",
      path: "Second.md",
    });
    api.editor.getSelection.mockResolvedValue("second selection");
    await logic.insert_template(
      api,
      render,
      "{{current_note.name}}: {{selection.text}}",
    );
    expect(
      api.editor.replaceSelection.mock.calls.map((call) => call[0]),
    ).toEqual(["First: first selection", "Second: second selection"]);
    await expect(
      logic.insert_template(api, render, "{{#if broken}}"),
    ).rejects.toThrow();
    expect(api.editor.replaceSelection).toHaveBeenCalledTimes(2);
  });

  it("creates a note from a template when no editor is open", async () => {
    const api = make_api();
    api.editor.getInfo.mockRejectedValue(new Error("No active editor"));
    api.editor.getSelection.mockRejectedValue(new Error("No active editor"));
    const render = load_engine();
    await logic.create_note(
      api,
      render,
      '{{default selection.text "Start here"}}',
      "First note",
    );
    expect(api.vault.create).toHaveBeenCalledWith(
      "first-note.md",
      "Start here",
    );
    expect(api.actions.execute).toHaveBeenCalledWith("note.open", [
      { note_path: "first-note.md" },
    ]);
  });

  it("does not persist a command already delivered to a mounted panel", async () => {
    const api = make_api();
    await logic.open_command(api, "smart-templates:create-template", true);
    expect(api.actions.execute).toHaveBeenCalledWith("ui.set_sidebar_view", [
      "smart-templates:panel",
    ]);
    expect(api.settings.set).not.toHaveBeenCalled();
    const panel = await load_panel(api);
    expect(
      panel.element<HTMLTextAreaElement>("template-editor").value,
    ).toContain("Agenda");
  });

  it("does not turn a failed create into an overwrite", async () => {
    const api = make_api();
    api.vault.create.mockRejectedValueOnce(new Error("Disk full"));
    await expect(
      logic.save_template(api, "templates", "New", "", "body"),
    ).rejects.toThrow("Disk full");
    expect(api.vault.modify).not.toHaveBeenCalled();
  });
});

describe("Smart Templates panel", () => {
  it("registers bare palette ids and opens the requested view on first activation", async () => {
    const api = make_api();
    const runtime = await load_panel(api, "runtime");
    expect(api.ui.addSidebarPanel).toHaveBeenCalledWith({
      id: "panel",
      label: "Smart Templates",
      icon: "file-text",
    });
    expect(api.commands.register.mock.calls.map((call) => call[0].id)).toEqual(
      logic.COMMANDS.map((command) => command.id),
    );
    await runtime.command("insert-template");
    expect(api.actions.execute).toHaveBeenCalledWith("ui.set_sidebar_view", [
      "smart-templates:panel",
    ]);
    expect(api.settings_values.get("requested_view")).toBe("insert-template");
    const panel = await load_panel(api);
    expect(panel.element("picker-view").classList.contains("hidden")).toBe(
      false,
    );
    await panel.command("create-template");
    expect(panel.element<HTMLTextAreaElement>("template-editor").value).toBe(
      "",
    );
    expect(panel.element("editor-view").classList.contains("hidden")).toBe(
      false,
    );
    await panel.command("create-from-note");
    expect(panel.element<HTMLTextAreaElement>("template-editor").value).toBe(
      "From current note",
    );
  });

  it("navigates the picker with arrows, Enter, and Escape", async () => {
    const panel = await load_panel();
    await panel.click("btn-picker");
    expect(document.querySelectorAll('[role="option"]')).toHaveLength(3);
    await panel.key("picker-search-input", "ArrowDown");
    expect(
      document.querySelector('[aria-selected="true"]')?.textContent,
    ).toContain("Journal");
    await panel.key("picker-search-input", "Enter");
    expect(
      panel.element<HTMLTextAreaElement>("template-editor").value,
    ).toContain("Morning Reflection");
    await panel.click("btn-picker");
    await panel.key("picker-search-input", "Escape");
    expect(document.activeElement).toBe(panel.element("template-editor"));
    expect(panel.element("picker-view").classList.contains("hidden")).toBe(
      true,
    );
  });

  it("asks before replacing a saved template, keeps Unicode names, and reopens metadata", async () => {
    const api = make_api();
    api.files.set(
      "templates/你好.md",
      '---\ntemplate.name: "你好"\ntemplate.category: "工作"\n---\nOriginal',
    );
    const panel = await load_panel(api);
    await panel.click("btn-picker");
    required_element('[data-action="edit"]').click();
    await settle();
    await panel.click("btn-save");
    expect(panel.element<HTMLInputElement>("save-name").value).toBe("你好");
    expect(panel.element<HTMLInputElement>("save-category").value).toBe("工作");
    panel.element<HTMLTextAreaElement>("template-editor").value = "Changed";
    await panel.click("save-confirm");
    expect(api.vault.modify).not.toHaveBeenCalled();
    expect(panel.element("save-confirm").textContent).toContain("Replace");
    await panel.click("save-confirm");
    expect(api.vault.modify).toHaveBeenCalledWith(
      "templates/你好.md",
      '---\ntemplate.name: "你好"\ntemplate.category: "工作"\n---\nChanged',
    );
    expect(panel.element("save-dialog").classList.contains("visible")).toBe(
      false,
    );
  });

  it("uses current source/context for toolbar and one-click insert; snippets contain real newlines", async () => {
    const panel = await load_panel();
    const editor = panel.element<HTMLTextAreaElement>("template-editor");
    editor.value = "{{current_note.name}} {{selection.text}}";
    await panel.click("btn-preview");
    panel.api.editor.getInfo.mockResolvedValue({
      path: "New.md",
      name: "New.md",
    });
    panel.api.editor.getSelection.mockResolvedValue("latest");
    editor.value += " edited";
    await panel.click("btn-insert");
    expect(panel.api.editor.replaceSelection).toHaveBeenLastCalledWith(
      "New latest edited",
    );
    await panel.click("btn-picker");
    required_element('[data-action="insert"]').click();
    await settle();
    expect(panel.api.editor.replaceSelection).toHaveBeenCalledTimes(2);
    editor.value = "";
    required_element('[data-insert^="{{#if"]').click();
    expect(editor.value).toBe("{{#if condition}}\n\n{{/if}}");
  });

  it("creates and opens a freshly rendered note without overwriting an existing file", async () => {
    const panel = await load_panel();
    panel.element<HTMLTextAreaElement>("template-editor").value =
      "# {{current_note.name}}\n{{selection.text}}";
    await panel.click("btn-new-note");
    panel.element<HTMLInputElement>("save-name").value = "新笔记";
    await panel.key("save-name", "Enter");
    expect(panel.api.vault.create).toHaveBeenCalledWith(
      "新笔记.md",
      "# First\nfirst selection",
    );
    expect(panel.api.actions.execute).toHaveBeenCalledWith("note.open", [
      { note_path: "新笔记.md" },
    ]);
    await panel.click("btn-new-note");
    panel.element<HTMLInputElement>("save-name").value = "新笔记";
    await panel.click("save-confirm");
    expect(panel.api.vault.create).toHaveBeenCalledTimes(1);
    expect(panel.element("status-text").textContent).toContain(
      "already exists",
    );
  });

  it("does not publish an in-flight preview after the source changes", async () => {
    const panel = await load_panel();
    let finish: (value: { name: string; path: string }) => void = () => {};
    const pending = new Promise<{ name: string; path: string }>((resolve) => {
      finish = resolve;
    });
    panel.api.editor.getInfo.mockReturnValueOnce(pending);
    const editor = panel.element<HTMLTextAreaElement>("template-editor");
    editor.value = "Old source";
    await panel.click("btn-preview");
    editor.value = "New source";
    editor.dispatchEvent(new Event("input"));
    finish({ name: "First.md", path: "First.md" });
    await settle();
    expect(panel.element("preview-output").textContent).not.toBe("Old source");
    await vi.advanceTimersByTimeAsync(1000);
    expect(panel.element("preview-output").textContent).toBe("New source");
  });

  it("shows template errors, search empty states, and applies supplied app tokens", async () => {
    const panel = await load_panel();
    panel.element<HTMLTextAreaElement>("template-editor").value =
      "{{#if broken}}";
    await panel.click("btn-preview");
    expect(panel.element("preview-output").classList.contains("error")).toBe(
      true,
    );
    await panel.click("btn-insert");
    expect(panel.api.editor.replaceSelection).not.toHaveBeenCalled();
    await panel.click("btn-picker");
    panel.element<HTMLInputElement>("picker-search-input").value = "no-match";
    panel.element("picker-search-input").dispatchEvent(new Event("input"));
    await vi.advanceTimersByTimeAsync(100);
    expect(panel.element("picker-list").textContent).toContain(
      "No templates found",
    );
    await panel.message({
      method: "theme.update",
      params: [
        {
          "--background": "rgb(255, 255, 255)",
          "--foreground": "rgb(0, 0, 0)",
        },
        "light",
      ],
    });
    expect(
      document.documentElement.style.getPropertyValue("--background"),
    ).toBe("rgb(255, 255, 255)");
    expect(document.documentElement.style.colorScheme).toBe("light");
  });
});
