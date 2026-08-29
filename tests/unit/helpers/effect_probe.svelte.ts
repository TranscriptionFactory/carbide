/* Counts how often an $effect re-runs for a given read, so a test can assert
   that a store write woke only the readers it should have. */
export function create_effect_probe(read: () => unknown) {
  let runs = 0;
  const stop = $effect.root(() => {
    $effect(() => {
      read();
      runs += 1;
    });
  });
  return {
    runs: () => runs,
    stop,
  };
}
