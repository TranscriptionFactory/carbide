export type NavContext =
  | "file_tree"
  | "tab_bar"
  | "outline"
  | "omnibar"
  | "none";

export type KeySequenceResult =
  | { status: "matched"; action_id: string; count: number }
  | { status: "pending" }
  | { status: "no_match" };

export type VimNavBinding = {
  sequence: string;
  action_id: string;
  label: string;
  supports_count?: boolean;
};

export type VimNavContextBindings = {
  context: NavContext | "global";
  label: string;
  bindings: VimNavBinding[];
};
