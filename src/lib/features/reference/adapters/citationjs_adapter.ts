import { Cite } from "@citation-js/core";
import "@citation-js/plugin-bibtex";
import "@citation-js/plugin-ris";
import "@citation-js/plugin-csl";
import type { CitationPort } from "../ports";
import type { CslItem } from "../types";

const BUILTIN_STYLES = ["apa", "vancouver", "harvard1"];

async function parse_input(
  input: string,
  force_type?: string,
): Promise<CslItem[]> {
  const cite = await Cite.async(
    input,
    force_type ? { forceType: force_type } : undefined,
  );
  return cite.data as CslItem[];
}

async function render(
  type: "citation" | "bibliography",
  items: CslItem[],
  style: string,
  format: "text" | "html",
): Promise<string> {
  const cite = await Cite.async(items);
  return cite.format(type, { format, template: style, lang: "en-US" });
}

export function create_citationjs_adapter(): CitationPort {
  return {
    async parse_bibtex(bibtex: string): Promise<CslItem[]> {
      return parse_input(bibtex, "@bibtex/text");
    },

    async parse_ris(ris: string): Promise<CslItem[]> {
      return parse_input(ris, "@ris/file");
    },

    async render_citation(
      items: CslItem[],
      style: string,
      format: "text" | "html" = "html",
    ): Promise<string> {
      return render("citation", items, style, format);
    },

    async render_bibliography(
      items: CslItem[],
      style: string,
      format: "text" | "html" = "html",
    ): Promise<string> {
      return render("bibliography", items, style, format);
    },

    list_styles(): string[] {
      return [...BUILTIN_STYLES];
    },
  };
}
