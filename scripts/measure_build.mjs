import { stat, readdir } from "node:fs/promises";
import path from "node:path";

async function listFiles(root) {
  const entries = await readdir(root, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const entryPath = path.join(root, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await listFiles(entryPath)));
      continue;
    }
    files.push(entryPath);
  }

  return files;
}

function formatBytes(bytes) {
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

async function main() {
  const candidateRoots = [
    "build/_app/immutable",
    ".svelte-kit/output/client/_app/immutable",
  ];

  let root = null;
  for (const candidate of candidateRoots) {
    try {
      await stat(candidate);
      root = candidate;
      break;
    } catch {
      continue;
    }
  }

  if (!root) {
    throw new Error(
      "No immutable client output found. Run `pnpm build` first.",
    );
  }

  const files = await listFiles(root);
  const summaries = await Promise.all(
    files.map(async (file) => ({
      file,
      bytes: (await stat(file)).size,
    })),
  );

  const clientFiles = summaries.filter((entry) =>
    /\.(js|css|mjs)$/.test(entry.file),
  );
  const totalBytes = clientFiles.reduce((sum, entry) => sum + entry.bytes, 0);
  const largest = [...clientFiles]
    .sort((a, b) => b.bytes - a.bytes)
    .slice(0, 10)
    .map((entry) => ({
      file: path.relative(root, entry.file),
      bytes: entry.bytes,
      size: formatBytes(entry.bytes),
    }));

  console.log(
    JSON.stringify(
      {
        root,
        file_count: clientFiles.length,
        total_bytes: totalBytes,
        total_size: formatBytes(totalBytes),
        largest,
      },
      null,
      2,
    ),
  );
}

void main();
