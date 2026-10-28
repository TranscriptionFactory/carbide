import json
import mimetypes
import sys
from pathlib import Path

import gi

gi.require_version("WebKit2", "4.1")
gi.require_version("Gtk", "3.0")
from gi.repository import Gio, GLib, Gtk, WebKit2  # noqa: E402

DIST = Path(__file__).resolve().parents[3] / "src-tauri" / "sheet-dist"
CSV = 'Id,Metric,Jan,Feb,Total\r\n007,Revenue,"$1,250.50",50%,=sum(c2:d2)\r\n008,"Cost, fixed",650,700,=SUM(C3:D3)\r\n'
mimetypes.add_type("application/wasm", ".wasm")

HOST_HTML = f"""<!doctype html><body style="margin:0"><iframe id="f" src="carbide-sheet://localhost/index.html" style="width:1000px;height:600px;border:0"></iframe>
<script>
  window.log = []; window.errors = [];
  window.addEventListener("error", (e) => window.errors.push(String(e.message)));
  window.addEventListener("message", (e) => {{
    window.log.push(e.data);
    if (e.data.type === "ready") document.getElementById("f").contentWindow.postMessage({{ type: "init_sheet", text: {json.dumps(CSV)}, delimiter: "" }}, "*");
  }});
  window.ask = () => document.getElementById("f").contentWindow.postMessage({{ type: "get_text" }}, "*");
</script></body>"""

served = []


def respond(request, body: bytes, mime: str):
    stream = Gio.MemoryInputStream.new_from_bytes(GLib.Bytes.new(body))
    response = WebKit2.URISchemeResponse.new(stream, len(body))
    response.set_content_type(mime)
    request.finish_with_response(response)


def serve_sheet(request):
    rel = request.get_path().lstrip("/") or "index.html"
    target = (DIST / rel).resolve()
    if not str(target).startswith(str(DIST)) or not target.exists():
        request.finish_error(GLib.Error.new_literal(Gio.io_error_quark(), "not found", Gio.IOErrorEnum.NOT_FOUND))
        served.append((rel, 404))
        return
    served.append((rel, 200))
    respond(request, target.read_bytes(), mimetypes.guess_type(str(target))[0] or "application/octet-stream")


def serve_host(request):
    respond(request, HOST_HTML.encode(), "text/html")


context = WebKit2.WebContext.get_default()
security = context.get_security_manager()
for scheme, handler in (("carbide-sheet", serve_sheet), ("carbide-host", serve_host)):
    context.register_uri_scheme(scheme, handler)
    security.register_uri_scheme_as_secure(scheme)
    security.register_uri_scheme_as_cors_enabled(scheme)

window = Gtk.OffscreenWindow()
view = WebKit2.WebView.new_with_context(context)
view.set_size_request(1000, 600)
window.add(view)
window.show_all()

results = {}
steps = []


def js(script, done):
    def finish(webview, task):
        try:
            value = webview.evaluate_javascript_finish(task)
            done(json.loads(value.to_json(0)) if value else None)
        except Exception as error:
            done({"js_error": str(error)})

    view.evaluate_javascript(script, -1, None, None, None, finish)


def guest_eval(expr):
    return f"document.getElementById('f').contentWindow.eval({json.dumps(expr)})"


EDIT = """(() => {
  const key = (t, k, extra) => t.dispatchEvent(new KeyboardEvent('keydown', Object.assign({ key: k, bubbles: true, cancelable: true }, extra || {})));
  const c = document.querySelector('.ic-workbook-container'); c.focus(); key(c, '=');
  const ed = [...document.querySelectorAll('textarea')].find((t) => t === document.activeElement) || document.querySelectorAll('textarea')[1];
  Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set.call(ed, '=C3*2');
  ed.dispatchEvent(new Event('input', { bubbles: true })); key(ed, 'Enter');
  return 'edited';
})()"""


def poll(predicate_js, key, then, tries=150):
    def check(value):
        if value:
            results[key] = value
            then()
        elif tries <= 0:
            results[key] = "TIMEOUT"
            finish()
        else:
            GLib.timeout_add(100, lambda: (poll(predicate_js, key, then, tries - 1), False)[1])

    js(predicate_js, check)


def text_response():
    return "(() => { const m = window.log.filter((x) => x.type === 'text_response'); return m.length ? m[m.length - 1].text : null })()"


def step_ready():
    poll("window.log.some((m) => m.type === 'ready')", "ready", lambda: GLib.timeout_add(1500, step_untouched))


def step_untouched():
    js("window.ask(); true", lambda _v: poll(text_response(), "untouched", step_edit))
    return False


def step_edit():
    results["untouched_identical"] = results["untouched"] == CSV
    js("window.log = window.log.filter((m) => m.type !== 'text_response'); true", lambda _v: js(
        guest_eval(EDIT), lambda v: (results.__setitem__("edit", v), GLib.timeout_add(1000, step_after_edit))))


def step_after_edit():
    js("window.log.filter((m) => m.type === 'sheet_changed').length", lambda v: (
        results.__setitem__("sheet_changed", v),
        js(guest_eval("document.activeElement.dispatchEvent(new KeyboardEvent('keydown', { key: 's', ctrlKey: true, bubbles: true, cancelable: true })); 1"),
           lambda _v: js("window.ask(); window.log.filter((m) => m.type === 'save_requested').length", lambda n: (
               results.__setitem__("save_requested", n), poll(text_response(), "edited", finish))))))
    return False


def finish():
    js("JSON.stringify({ log: window.log.map((m) => m.type), errors: window.errors })", lambda v: (
        results.__setitem__("host", v), report()))


def report():
    results["served"] = served
    results.pop("untouched", None)
    print(json.dumps(results, indent=1))
    Gtk.main_quit()


def on_load(webview, event):
    if event == WebKit2.LoadEvent.FINISHED and not steps:
        steps.append(1)
        step_ready()


view.connect("load-changed", on_load)
view.load_uri("carbide-host://localhost/")
GLib.timeout_add_seconds(40, lambda: (results.__setitem__("fatal", "global timeout"), report()))
Gtk.main()
sys.exit(0)
