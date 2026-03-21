export function longest_common_prefix(strings: string[]): string {
  if (strings.length === 0) return "";
  let prefix = strings[0] ?? "";
  for (let i = 1; i < strings.length; i++) {
    const s = strings[i] ?? "";
    let j = 0;
    while (j < prefix.length && j < s.length && prefix[j] === s[j]) j++;
    prefix = prefix.slice(0, j);
  }
  return prefix;
}
