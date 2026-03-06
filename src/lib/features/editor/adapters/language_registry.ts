export type LanguageEntry = {
  id: string;
  label: string;
};

export const POPULAR_LANGUAGES: LanguageEntry[] = [
  { id: "javascript", label: "JavaScript" },
  { id: "typescript", label: "TypeScript" },
  { id: "python", label: "Python" },
  { id: "rust", label: "Rust" },
  { id: "go", label: "Go" },
  { id: "java", label: "Java" },
  { id: "c", label: "C" },
  { id: "cpp", label: "C++" },
  { id: "csharp", label: "C#" },
  { id: "html", label: "HTML" },
  { id: "css", label: "CSS" },
  { id: "json", label: "JSON" },
  { id: "sql", label: "SQL" },
  { id: "bash", label: "Bash" },
  { id: "markdown", label: "Markdown" },
  { id: "yaml", label: "YAML" },
  { id: "toml", label: "TOML" },
  { id: "ruby", label: "Ruby" },
  { id: "php", label: "PHP" },
  { id: "swift", label: "Swift" },
  { id: "kotlin", label: "Kotlin" },
  { id: "jsx", label: "JSX" },
  { id: "tsx", label: "TSX" },
  { id: "svelte", label: "Svelte" },
  { id: "mermaid", label: "Mermaid" },
];

export const ALL_LANGUAGES: LanguageEntry[] = [
  ...POPULAR_LANGUAGES,
  { id: "arduino", label: "Arduino" },
  { id: "clojure", label: "Clojure" },
  { id: "coffeescript", label: "CoffeeScript" },
  { id: "dart", label: "Dart" },
  { id: "diff", label: "Diff" },
  { id: "docker", label: "Docker" },
  { id: "elixir", label: "Elixir" },
  { id: "elm", label: "Elm" },
  { id: "erlang", label: "Erlang" },
  { id: "fortran", label: "Fortran" },
  { id: "fsharp", label: "F#" },
  { id: "graphql", label: "GraphQL" },
  { id: "groovy", label: "Groovy" },
  { id: "haskell", label: "Haskell" },
  { id: "ini", label: "INI" },
  { id: "julia", label: "Julia" },
  { id: "latex", label: "LaTeX" },
  { id: "less", label: "Less" },
  { id: "lisp", label: "Lisp" },
  { id: "lua", label: "Lua" },
  { id: "makefile", label: "Makefile" },
  { id: "matlab", label: "MATLAB" },
  { id: "nginx", label: "Nginx" },
  { id: "objectivec", label: "Objective-C" },
  { id: "ocaml", label: "OCaml" },
  { id: "pascal", label: "Pascal" },
  { id: "perl", label: "Perl" },
  { id: "powershell", label: "PowerShell" },
  { id: "prolog", label: "Prolog" },
  { id: "protobuf", label: "Protocol Buffers" },
  { id: "r", label: "R" },
  { id: "regex", label: "Regex" },
  { id: "sass", label: "Sass" },
  { id: "scala", label: "Scala" },
  { id: "scheme", label: "Scheme" },
  { id: "scss", label: "SCSS" },
  { id: "solidity", label: "Solidity" },
  { id: "vim", label: "Vim" },
  { id: "wasm", label: "WebAssembly" },
  { id: "xml", label: "XML" },
  { id: "zig", label: "Zig" },
].sort((a, b) => a.label.localeCompare(b.label));

export function find_language_label(language_id: string): string {
  if (!language_id) return "Plain Text";
  const entry =
    POPULAR_LANGUAGES.find((l) => l.id === language_id) ??
    ALL_LANGUAGES.find((l) => l.id === language_id);
  return entry?.label ?? language_id;
}

export function search_languages(query: string): {
  popular: LanguageEntry[];
  all: LanguageEntry[];
} {
  const lower = query.toLowerCase();
  if (!lower) return { popular: POPULAR_LANGUAGES, all: ALL_LANGUAGES };
  return {
    popular: POPULAR_LANGUAGES.filter(
      (l) => l.id.includes(lower) || l.label.toLowerCase().includes(lower),
    ),
    all: ALL_LANGUAGES.filter(
      (l) => l.id.includes(lower) || l.label.toLowerCase().includes(lower),
    ),
  };
}
