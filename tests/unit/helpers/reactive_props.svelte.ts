/* Getter-backed props over a single $state object: replace() swaps the whole
   object so every prop read invalidates at once, mirroring a parent that
   spread-replaces its state object on each update. */
export function create_replaceable_props<T extends Record<string, unknown>>(
  initial: T,
) {
  let current = $state(initial);
  const props = {} as T;
  for (const key of Object.keys(initial) as Array<keyof T & string>) {
    Object.defineProperty(props, key, {
      get: () => current[key],
      enumerable: true,
    });
  }
  return {
    props,
    replace(patch: Partial<T>) {
      current = { ...current, ...patch };
    },
  };
}
