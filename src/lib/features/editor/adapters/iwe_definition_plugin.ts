import { Plugin, PluginKey } from "prosemirror-state";
import type { IweLocation } from "$lib/features/iwe";
import { line_and_character_from_pos } from "./iwe_plugin_utils";

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

          const { line, character } = line_and_character_from_pos(
            view,
            pos_result.pos,
          );

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
