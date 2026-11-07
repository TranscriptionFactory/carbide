export function create_renderer(
  handlebars,
  default_date_format = "YYYY-MM-DD",
) {
  const engine = handlebars.create();
  const register = (name, helper) =>
    engine.registerHelper(name, (...args) => helper(...args.slice(0, -1)));
  const DATE_TOKENS = {
    YYYY: (d) => String(d.getFullYear()),
    YY: (d) => String(d.getFullYear()).slice(-2),
    MM: (d) => String(d.getMonth() + 1).padStart(2, "0"),
    DD: (d) => String(d.getDate()).padStart(2, "0"),
    HH: (d) => String(d.getHours()).padStart(2, "0"),
    mm: (d) => String(d.getMinutes()).padStart(2, "0"),
    ss: (d) => String(d.getSeconds()).padStart(2, "0"),
    ddd: (d) => ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][d.getDay()],
    dddd: (d) =>
      [
        "Sunday",
        "Monday",
        "Tuesday",
        "Wednesday",
        "Thursday",
        "Friday",
        "Saturday",
      ][d.getDay()],
    MMMM: (d) =>
      [
        "January",
        "February",
        "March",
        "April",
        "May",
        "June",
        "July",
        "August",
        "September",
        "October",
        "November",
        "December",
      ][d.getMonth()],
    MMM: (d) =>
      [
        "Jan",
        "Feb",
        "Mar",
        "Apr",
        "May",
        "Jun",
        "Jul",
        "Aug",
        "Sep",
        "Oct",
        "Nov",
        "Dec",
      ][d.getMonth()],
  };

  function format_date(fmt) {
    const now = new Date();
    return (fmt || "YYYY-MM-DD").replace(
      /YYYY|MMMM|dddd|MMM|ddd|YY|MM|DD|HH|mm|ss/g,
      (key) => DATE_TOKENS[key](now),
    );
  }

  register("date", (fmt) => format_date(fmt || default_date_format));
  register("time", (fmt) => format_date(fmt || "HH:mm"));

  register("eq", (a, b) => a === b);
  register("ne", (a, b) => a !== b);
  register("gt", (a, b) => a > b);
  register("gte", (a, b) => a >= b);
  register("lt", (a, b) => a < b);
  register("lte", (a, b) => a <= b);

  register("uppercase", (s) => (s ? String(s).toUpperCase() : ""));
  register("lowercase", (s) => (s ? String(s).toLowerCase() : ""));
  register("truncate", (s, len) => {
    if (!s) return "";
    const str = String(s);
    const n = Number(len) || 50;
    return str.length > n ? str.slice(0, n) + "..." : str;
  });
  register("slugify", slugify);
  register("default", (val, fallback) =>
    val != null && val !== "" ? val : fallback,
  );
  register("trim", (s) => (s ? String(s).trim() : ""));
  register("replace", (s, find, rep) =>
    s ? String(s).replaceAll(String(find || ""), String(rep || "")) : "",
  );
  register("concat", (...args) =>
    args.map((a) => (a == null ? "" : String(a))).join(""),
  );
  register("contains", (s, substr) =>
    Boolean(s && substr && String(s).includes(String(substr))),
  );

  register("split", (s, delim) =>
    s ? String(s).split(String(delim || ",")) : [],
  );
  register("join", (arr, delim) =>
    Array.isArray(arr) ? arr.join(String(delim ?? ", ")) : "",
  );
  register("first", (arr) =>
    Array.isArray(arr) && arr.length > 0 ? arr[0] : "",
  );
  register("last", (arr) =>
    Array.isArray(arr) && arr.length > 0 ? arr[arr.length - 1] : "",
  );
  register("length", (val) => {
    if (Array.isArray(val)) return val.length;
    if (typeof val === "string") return val.length;
    return 0;
  });
  register("reverse", (arr) => (Array.isArray(arr) ? [...arr].reverse() : []));
  register("sort", (arr) => (Array.isArray(arr) ? [...arr].sort() : []));
  register("uniq", (arr) => (Array.isArray(arr) ? [...new Set(arr)] : []));

  register("add", (a, b) => Number(a) + Number(b));
  register("sub", (a, b) => Number(a) - Number(b));
  register("mul", (a, b) => Number(a) * Number(b));
  register("div", (a, b) => {
    const divisor = Number(b);
    return divisor === 0 ? 0 : Number(a) / divisor;
  });
  register("mod", (a, b) => {
    const divisor = Number(b);
    return divisor === 0 ? 0 : Number(a) % divisor;
  });
  register("round", (num, dec) => {
    const n = Number(num);
    const d = Number(dec) || 0;
    const factor = Math.pow(10, d);
    return Math.round(n * factor) / factor;
  });

  return (source, context) =>
    engine.compile(source, { noEscape: true })(context);
}

export function slugify(s) {
  if (!s) return "";
  return String(s)
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-|-$/g, "");
}
export function parse_frontmatter(content) {
  if (!content.startsWith("---")) {
    return { frontmatter: {}, body: content };
  }
  const end_idx = content.indexOf("\n---", 3);
  if (end_idx < 0) {
    return { frontmatter: {}, body: content };
  }
  const raw = content.slice(4, end_idx).trim();
  const fm = {};
  for (const line of raw.split("\n")) {
    const colon = line.indexOf(":");
    if (colon < 0) continue;
    const key = line.slice(0, colon).trim();
    let val = line.slice(colon + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      try {
        val = val.startsWith('"') ? JSON.parse(val) : val.slice(1, -1);
      } catch {
        val = val.slice(1, -1);
      }
    }
    if (key.startsWith("template.")) {
      const sub_key = key.slice(9);
      if (!fm.template) fm.template = {};
      fm.template[sub_key] = val;
    } else {
      fm[key] = val;
    }
  }
  const body = content.slice(end_idx + 4).replace(/^\n/, "");
  return { frontmatter: fm, body };
}

export function build_frontmatter(meta) {
  const lines = ["---"];
  if (meta.name) lines.push(`template.name: ${JSON.stringify(meta.name)}`);
  if (meta.description)
    lines.push(`template.description: ${JSON.stringify(meta.description)}`);
  if (meta.category)
    lines.push(`template.category: ${JSON.stringify(meta.category)}`);
  lines.push("---");
  return lines.join("\n");
}

export async function gather_context(api) {
  const [info, selection] = await Promise.all([
    api.editor.getInfo().catch(() => null),
    api.editor.getSelection().catch(() => ""),
  ]);
  const context = {
    current_note: {
      path: info?.path || "",
      name: (info?.name || "Untitled").replace(/\.md$/, ""),
    },
    selection: { text: selection || "" },
    fileCache: { frontmatter: {}, tags: [], headings: [], links: [] },
    backlinks: [],
  };
  if (info?.path) {
    const [cache, backlinks] = await Promise.all([
      api.metadata.getFileCache(info.path),
      api.metadata.getBacklinks(info.path),
    ]);
    if (cache)
      context.fileCache = {
        ...cache,
        frontmatter: Object.fromEntries(
          Object.entries(cache.frontmatter || {}).map(([key, value]) => [
            key,
            Array.isArray(value) &&
            value.length === 2 &&
            typeof value[1] === "string"
              ? value[0]
              : value,
          ]),
        ),
      };
    context.backlinks = backlinks || [];
  }
  return context;
}

export async function insert_template(api, render, source) {
  const result = render(source, await gather_context(api));
  if (result) await api.editor.replaceSelection(result);
  return result;
}

export async function save_template(
  api,
  folder,
  name,
  category,
  body,
  overwrite = false,
) {
  const stem = slugify(name);
  if (!stem) throw new Error("Use a name with letters or numbers");
  const path = `${folder.replace(/\/+$/, "")}/${stem}.md`;
  const exists = (await api.vault.list()).includes(path);
  if (exists && !overwrite) return { path, needs_confirmation: true };
  const content = build_frontmatter({ name, category }) + "\n" + body;
  if (exists) await api.vault.modify(path, content);
  else await api.vault.create(path, content);
  return { path, needs_confirmation: false };
}

export async function create_note(api, render, source, name) {
  const stem = slugify(name);
  if (!stem) throw new Error("Use a name with letters or numbers");
  const path = `${stem}.md`;
  if ((await api.vault.list()).includes(path))
    throw new Error("A note with that name already exists");
  const content = render(source, await gather_context(api));
  await api.vault.create(path, content);
  await api.actions.execute("note.open", [{ note_path: path }]);
  return path;
}

export const COMMANDS = [
  { id: "open-panel", label: "Open Smart Templates" },
  { id: "insert-template", label: "Insert Template" },
  { id: "create-template", label: "Create Template" },
  { id: "create-from-note", label: "Create Template from Note" },
];

export async function open_command(api, command, panel_ready = false) {
  const id = command.replace(/^smart-templates:/, "");
  if (!COMMANDS.some((item) => item.id === id)) return false;
  if (!panel_ready) await api.settings.set("requested_view", id);
  await api.actions.execute("ui.set_sidebar_view", ["smart-templates:panel"]);
  return true;
}
