import React, { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { IronCalc, init } from "@ironcalc/workbook";
import "@ironcalc/workbook/style.css";
import type { HostMessage } from "./bridge";
import { post_to_host } from "./bridge";
import {
  load_sheet,
  serialize_sheet,
  take_dirty,
  type LoadedSheet,
} from "./sheet_csv_model";

const DIRTY_POLL_MS = 300;

function is_save_shortcut(event: KeyboardEvent): boolean {
  return (event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "s";
}

function App() {
  const [sheet, set_sheet] = useState<LoadedSheet | null>(null);
  const sheet_ref = useRef<LoadedSheet | null>(null);
  sheet_ref.current = sheet;

  useEffect(() => {
    function handle_message(event: MessageEvent<HostMessage>) {
      const message = event.data;
      if (message.type === "init_sheet") {
        try {
          set_sheet(load_sheet(message.text, message.delimiter));
        } catch (error) {
          post_to_host({ type: "load_failed", reason: String(error) });
        }
      } else if (message.type === "get_text" && sheet_ref.current) {
        post_to_host({
          type: "text_response",
          text: serialize_sheet(sheet_ref.current),
        });
      }
    }

    function handle_keydown(event: KeyboardEvent) {
      if (!is_save_shortcut(event)) return;
      event.preventDefault();
      event.stopPropagation();
      post_to_host({ type: "save_requested" });
    }

    window.addEventListener("message", handle_message);
    window.addEventListener("keydown", handle_keydown, true);
    post_to_host({ type: "ready" });
    return () => {
      window.removeEventListener("message", handle_message);
      window.removeEventListener("keydown", handle_keydown, true);
    };
  }, []);

  useEffect(() => {
    if (!sheet) return;
    const timer = setInterval(() => {
      if (take_dirty(sheet.model)) post_to_host({ type: "sheet_changed" });
    }, DIRTY_POLL_MS);
    return () => {
      clearInterval(timer);
    };
  }, [sheet]);

  return sheet ? <IronCalc model={sheet.model} /> : null;
}

init()
  .then(() => {
    const root = document.getElementById("root");
    if (!root) throw new Error("missing #root");
    createRoot(root).render(<App />);
  })
  .catch((error: unknown) => {
    post_to_host({ type: "load_failed", reason: String(error) });
  });
