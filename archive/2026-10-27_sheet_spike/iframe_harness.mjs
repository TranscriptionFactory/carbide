import { createServer } from "node:http";
import { readFile, writeFile } from "node:fs/promises";
import { extname, join, resolve } from "node:path";

const ROOT = resolve(import.meta.dirname, "../../..");
const DIST = join(ROOT, "src-tauri/sheet-dist");
const OUT = join(ROOT, ".tmpfiles");
const DRIVER = "http://127.0.0.1:4444";
const MIME = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".css": "text/css",
  ".wasm": "application/wasm",
};
const CSV =
  'Id,Metric,Jan,Feb,Total\r\n007,Revenue,"$1,250.50",50%,=sum(c2:d2)\r\n008,"Cost, fixed",650,700,=SUM(C3:D3)\r\n';

function serve(port, handler) {
  return new Promise((ok) => {
    const server = createServer(handler).listen(port, "127.0.0.1", () =>
      ok(server),
    );
  });
}

const guest = await serve(5181, async (req, res) => {
  const path = join(
    DIST,
    req.url === "/" ? "index.html" : req.url.split("?")[0],
  );
  try {
    const body = await readFile(path);
    res.writeHead(200, {
      "Content-Type": MIME[extname(path)] ?? "application/octet-stream",
    });
    res.end(body);
  } catch {
    res.writeHead(404).end();
  }
});

const host = await serve(5180, (_req, res) => {
  res.writeHead(200, { "Content-Type": "text/html" });
  res.end(`<!doctype html><body style="margin:0"><iframe id="f" src="http://127.0.0.1:5181/" style="width:1000px;height:600px;border:0"></iframe>
<script>
  window.log = [];
  window.errors = [];
  window.addEventListener("error", (e) => window.errors.push(String(e.message)));
  window.addEventListener("message", (e) => {
    window.log.push(e.data);
    if (e.data.type === "ready") document.getElementById("f").contentWindow.postMessage({ type: "init_sheet", text: ${JSON.stringify(CSV)}, delimiter: "" }, "*");
  });
  window.ask = () => document.getElementById("f").contentWindow.postMessage({ type: "get_text" }, "*");
</script></body>`);
});

async function wd(method, path, body) {
  const res = await fetch(`${DRIVER}${path}`, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json();
  if (!res.ok)
    throw new Error(`${method} ${path}: ${JSON.stringify(json.value)}`);
  return json.value;
}

const session = await wd("POST", "/session", {
  capabilities: {
    alwaysMatch: {
      "webkitgtk:browserOptions": {
        binary: "/usr/libexec/webkit2gtk-4.1/MiniBrowser",
        args: ["--automation"],
      },
    },
  },
});
const sid = session.sessionId;
console.log(
  "browser:",
  session.capabilities.browserName,
  session.capabilities.browserVersion,
);
const s = (path) => `/session/${sid}${path}`;
const run = (script, args = []) =>
  wd("POST", s("/execute/sync"), { script, args });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const count = (type) =>
  run("return window.log.filter((m) => m.type === arguments[0]).length", [
    type,
  ]);
async function wait_for(type, ms = 15000) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if ((await count(type)) > 0) return true;
    await sleep(100);
  }
  throw new Error(`timed out waiting for ${type}`);
}
async function shot(name) {
  await writeFile(
    join(OUT, name),
    Buffer.from(await wd("GET", s("/screenshot")), "base64"),
  );
}
async function ask_text() {
  await run(
    "window.log = window.log.filter((m) => m.type !== 'text_response'); window.ask();",
  );
  await wait_for("text_response");
  return run("return window.log.find((m) => m.type === 'text_response').text");
}

try {
  await wd("POST", s("/window/rect"), { width: 1100, height: 750 });
  const t0 = Date.now();
  await wd("POST", s("/url"), { url: "http://127.0.0.1:5180/" });
  await wait_for("ready");
  console.log(`ready after ${Date.now() - t0}ms`);
  await sleep(1500);
  console.log(
    "load_failed:",
    await count("load_failed"),
    await run("return JSON.stringify(window.log)"),
  );
  await shot("sheet_loaded.png");
  const frame_el = await wd("POST", s("/element"), {
    using: "css selector",
    value: "#f",
  });
  await wd("POST", s("/frame"), { id: frame_el });
  console.log(
    "guest dom:",
    await run(
      "const r = document.getElementById('root'); return JSON.stringify({ html: r.innerHTML.length, canvases: document.querySelectorAll('canvas').length, w: innerWidth, h: innerHeight, text: r.innerText.slice(0, 200) })",
    ),
  );
  await wd("POST", s("/frame/parent"), {});
  console.log(
    "host viewport:",
    await run(
      "return [innerWidth, innerHeight, document.getElementById('f').getBoundingClientRect().width]",
    ),
  );

  await sleep(700);
  console.log("sheet_changed before edit:", await count("sheet_changed"));
  const untouched = await ask_text();
  console.log("no-edit round trip identical:", untouched === CSV);
  if (untouched !== CSV) console.log("  got:", JSON.stringify(untouched));

  const iframe = await wd("POST", s("/element"), {
    using: "css selector",
    value: "#f",
  });
  await wd("POST", s("/frame"), { id: iframe });
  console.log(
    "guest inputs:",
    await run(
      "return [...document.querySelectorAll('textarea,input,[contenteditable=true],[tabindex]')].map((e) => e.tagName + '.' + String(e.className).slice(0, 40) + ' ti=' + e.tabIndex).slice(0, 12)",
    ),
  );
  const key = (target, k, extra = {}) =>
    `${target}.dispatchEvent(new KeyboardEvent('keydown', { key: '${k}', bubbles: true, cancelable: true, ...${JSON.stringify(extra)} }));`;
  console.log(
    "synthetic edit:",
    await run(`
    const container = document.querySelector('.ic-workbook-container');
    container.focus();
    ${key("container", "=")}
    const editor = [...document.querySelectorAll('textarea')].find((t) => t === document.activeElement) ?? document.querySelectorAll('textarea')[1];
    const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set;
    setter.call(editor, '=C3*2');
    editor.dispatchEvent(new Event('input', { bubbles: true }));
    ${key("editor", "Enter")}
    return document.activeElement.tagName + '.' + String(document.activeElement.className).slice(0, 40);
  `),
  );
  await sleep(1000);
  await wd("POST", s("/frame/parent"), {});
  console.log("sheet_changed after edit:", await count("sheet_changed"));
  await wd("POST", s("/frame"), { id: iframe });
  await run(key("document.activeElement", "s", { ctrlKey: true }));
  await wd("POST", s("/frame/parent"), {});
  await sleep(300);
  console.log("save_requested:", await count("save_requested"));
  const edited = await ask_text();
  console.log("after edit:", JSON.stringify(edited));
  await shot("sheet_edited.png");
  console.log("host errors:", await run("return window.errors"));
} finally {
  await wd("DELETE", s(""));
  guest.close();
  host.close();
}
