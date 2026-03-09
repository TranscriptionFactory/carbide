import fs from "node:fs";
import path from "node:path";
import { parseScriptArgs } from "./parse_script_args.mjs";

function readMetadataFiles(directory) {
  if (!fs.existsSync(directory)) {
    throw new Error(`Metadata directory not found: ${directory}`);
  }

  return fs
    .readdirSync(directory)
    .filter((name) => name.endsWith(".json"))
    .map((name) =>
      JSON.parse(fs.readFileSync(path.join(directory, name), "utf8")),
    );
}

function encodeAssetName(assetName) {
  return assetName
    .split("/")
    .map((part) => encodeURIComponent(part))
    .join("/");
}

const args = parseScriptArgs(process.argv.slice(2));
const inputDir = args.get("input-dir");
const repo = args.get("repo");
const tag = args.get("tag");
const outputPath = args.get("output");

if (!inputDir || !repo || !tag || !outputPath) {
  throw new Error(
    "Missing required arguments: --input-dir, --repo, --tag, --output",
  );
}

const workspaceRoot = path.resolve(import.meta.dirname, "..");
const metadataEntries = readMetadataFiles(path.join(workspaceRoot, inputDir));

if (metadataEntries.length === 0) {
  throw new Error("No updater metadata files found");
}

const version = metadataEntries[0].version;
const platforms = {};

for (const entry of metadataEntries) {
  if (entry.version !== version) {
    throw new Error("Mismatched app versions in updater metadata");
  }

  if (platforms[entry.platform]) {
    throw new Error(
      `Duplicate updater platform metadata for ${entry.platform}`,
    );
  }

  platforms[entry.platform] = {
    signature: entry.signature,
    url: `https://github.com/${repo}/releases/download/${tag}/${encodeAssetName(entry.asset_name)}`,
  };
}

const manifest = {
  version,
  pub_date: new Date().toISOString(),
  platforms,
};

fs.writeFileSync(
  path.join(workspaceRoot, outputPath),
  `${JSON.stringify(manifest, null, 2)}\n`,
);
