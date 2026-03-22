import { Plugin, PluginKey } from "prosemirror-state";
import type { IweLocation } from "$lib/features/iwe";

function count_newlines_before(text: string): number {
  let count = 0;
  for (let i = 0; i < text.length; i++) {
    if (text.charCodeAt(i) === 10) count++;
  }
  return count;
}

export function create_iwe_definition_plugin(input: {
  on_definition: (line: number, character: number) => Promise<IweLocation[]>;
  on_navigate: (uri: string) => void;
}): Plugin {
  return new Plugin({
    key: new PluginKey("iwe-definition"),
    props: {
      handleDOMEvents: {
        click: (view, event) => {
          const is_mod = event.metaKey || event.ctrlKey;
          if (!is_mod || event.button !== 0) return false;

          const coords = { left: event.clientX, top: event.clientY };
          const pos_result = view.posAtCoords(coords);
          if (!pos_result) return false;

          const pos = pos_result.pos;
          const doc = view.state.doc;
          const clamped = Math.min(pos, doc.content.size);
          const text_before = doc.textBetween(0, clamped, "\n");
          const line = count_newlines_before(text_before);
          const last_newline = text_before.lastIndexOf("\n");
          const character =
            last_newline === -1
              ? text_before.length
              : text_before.length - last_newline - 1;

          event.preventDefault();

          void input.on_definition(line, character).then((locations) => {
            if (locations.length === 0) return;
            const first = locations[0];
            if (first) input.on_navigate(first.uri);
          });

          return true;
        },
      },
    },
  });
}
