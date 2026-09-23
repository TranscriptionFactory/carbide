export const GRAPH_TAB_ID = "__graph__";
export const GRAPH_TAB_TITLE = "Vault Graph";

export function search_graph_tab_title(query: string): string {
  return query ? `Search: ${query}` : "Search Graph";
}
