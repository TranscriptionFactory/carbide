import type { SlashCommandContribution } from "../ports";
import type { EditorView } from "prosemirror-view";

export type PluginSlashCommand = SlashCommandContribution & {
  plugin_id: string;
};

export type SlashCommandExecutor = (
  plugin_id: string,
  command_name: string,
  context: { cursor_position: number; selection?: string },
) => Promise<{ text?: string } | null>;

export type EditorTextInserter = (text: string) => void;

export type PluginSlashCommandEntry = {
  id: string;
  label: string;
  description: string;
  icon: string;
  keywords: string[];
  insert: (view: EditorView, slash_from: number) => void;
  source: "plugin";
  plugin_name: string;
};

export function to_editor_slash_commands(
  commands: PluginSlashCommand[],
  executor: SlashCommandExecutor,
  get_plugin_name: (plugin_id: string) => string,
): PluginSlashCommandEntry[] {
  return commands.map((cmd) => ({
    id: cmd.id,
    label: cmd.name,
    description: cmd.description,
    icon: cmd.icon ?? "⚡",
    keywords: cmd.keywords ?? [cmd.name],
    source: "plugin" as const,
    plugin_name: get_plugin_name(cmd.plugin_id),
    insert: (view: EditorView, slash_from: number) => {
      const cursor = view.state.selection.from;
      const tr = view.state.tr.delete(slash_from, cursor);
      view.dispatch(tr);
      view.focus();

      const raw_id = cmd.id.includes(":")
        ? cmd.id.slice(cmd.id.indexOf(":") + 1)
        : cmd.id;

      void executor(cmd.plugin_id, raw_id, {
        cursor_position: slash_from,
      }).then((result) => {
        if (result?.text && view.dom.isConnected) {
          const insert_pos = Math.min(slash_from, view.state.doc.content.size);
          const insert_tr = view.state.tr.insertText(result.text, insert_pos);
          view.dispatch(insert_tr.scrollIntoView());
        }
      });
    },
  }));
}
