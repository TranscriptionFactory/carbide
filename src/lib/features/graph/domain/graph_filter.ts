export function matches_filter(
  query: string,
  label: string,
  id: string,
): boolean {
  if (!query) return true;
  const lower = query.toLocaleLowerCase();
  return (
    label.toLocaleLowerCase().includes(lower) ||
    id.toLocaleLowerCase().includes(lower)
  );
}
