(function () {
  const _pending = new Map();
  const _event_listeners = new Map();
  let _onload_cb = null;
  let _onunload_cb = null;

  function _rpc(method, ...params) {
    const id = crypto.randomUUID();
    window.parent.postMessage({ id, method, params }, "*");
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        _pending.delete(id);
        reject(new Error(`RPC timeout: ${method}`));
      }, 5000);
      _pending.set(id, {
        resolve: (v) => {
          clearTimeout(timer);
          resolve(v);
        },
        reject: (e) => {
          clearTimeout(timer);
          reject(e);
        },
      });
    });
  }

  window.addEventListener("message", (event) => {
    const msg = event.data;
    if (!msg) return;

    if (msg.id && _pending.has(msg.id)) {
      const { resolve, reject } = _pending.get(msg.id);
      _pending.delete(msg.id);
      if (msg.error) reject(new Error(msg.error));
      else resolve(msg.result);
      return;
    }

    if (msg.method === "lifecycle.activate") {
      if (_onload_cb) _onload_cb();
      return;
    }

    if (msg.method === "lifecycle.deactivate") {
      if (_onunload_cb) _onunload_cb();
      return;
    }

    if (msg.type === "event") {
      for (const [, { event_type, callback }] of _event_listeners) {
        if (event_type === msg.event) callback(msg.data, msg.timestamp);
      }
    }
  });

  window.carbide = {
    onload(cb) {
      _onload_cb = cb;
    },
    onunload(cb) {
      _onunload_cb = cb;
    },

    vault: {
      read: (path) => _rpc("vault.read", path),
      create: (path, content) => _rpc("vault.create", path, content),
      modify: (path, content) => _rpc("vault.modify", path, content),
      delete: (path) => _rpc("vault.delete", path),
      list: () => _rpc("vault.list"),
    },

    editor: {
      getInfo: () => _rpc("editor.get_info"),
      getValue: () => _rpc("editor.get_value"),
      getSelection: () => _rpc("editor.get_selection"),
      replaceSelection: (text) => _rpc("editor.replace_selection", text),
    },

    commands: {
      register: (opts) => _rpc("commands.register", opts),
      remove: (id) => _rpc("commands.remove", id),
    },

    ui: {
      addStatusBarItem: (opts) => _rpc("ui.add_statusbar_item", opts),
      updateStatusBarItem: (id, text) =>
        _rpc("ui.update_statusbar_item", id, text),
      removeStatusBarItem: (id) => _rpc("ui.remove_statusbar_item", id),
      addSidebarPanel: (opts) => _rpc("ui.add_sidebar_panel", opts),
      removeSidebarPanel: (id) => _rpc("ui.remove_sidebar_panel", id),
      showNotice: (message, duration) =>
        _rpc("ui.show_notice", { message, duration }),
      addRibbonIcon: (opts) => _rpc("ui.add_ribbon_icon", opts),
      removeRibbonIcon: (id) => _rpc("ui.remove_ribbon_icon", id),
    },

    search: {
      fts: (query, limit) => _rpc("search.fts", query, limit),
      tags: (pattern) => _rpc("search.tags", pattern),
    },

    settings: {
      get: (key) => _rpc("settings.get", key),
      set: (key, value) => _rpc("settings.set", key, value),
      getAll: () => _rpc("settings.get_all"),
      registerTab: (opts) => _rpc("settings.register_tab", opts),
    },

    events: {
      on(event_type, callback) {
        const callback_id = crypto.randomUUID();
        _event_listeners.set(callback_id, { event_type, callback });
        return _rpc("events.on", event_type, callback_id).then(
          () => callback_id,
        );
      },
      off(callback_id) {
        _event_listeners.delete(callback_id);
        return _rpc("events.off", callback_id);
      },
    },

    metadata: {
      query: (query) => _rpc("metadata.query", query),
      listProperties: () => _rpc("metadata.list_properties"),
      getBacklinks: (notePath) => _rpc("metadata.get_backlinks", notePath),
      getStats: (notePath) => _rpc("metadata.get_stats", notePath),
      getFileCache: (path) => _rpc("metadata.get_file_cache", path),
    },

    diagnostics: {
      push: (file_path, diagnostics) =>
        _rpc("diagnostics.push", file_path, diagnostics),
      clear: (file_path) => _rpc("diagnostics.clear", file_path),
    },

    network: {
      fetch: (url, opts) => _rpc("network.fetch", url, opts),
    },

    ai: {
      execute: (opts) => _rpc("ai.execute", opts),
    },
  };
})();
