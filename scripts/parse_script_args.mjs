export function parseScriptArgs(argv) {
  const values = new Map();

  for (const arg of argv) {
    if (!arg.startsWith("--") || !arg.includes("=")) {
      throw new Error(`Invalid argument: ${arg}`);
    }

    const index = arg.indexOf("=");
    values.set(arg.slice(2, index), arg.slice(index + 1));
  }

  return values;
}
