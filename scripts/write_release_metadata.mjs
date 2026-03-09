import fs from "node:fs";
import path from "node:path";
import { parseScriptArgs } from "./parse_script_args.mjs";

function findFirstMatchingFile(directory, predicate) {
  if (!fs.existsSync(directory)) {
    throw new Error(`Bundle directory not found: ${directory}`);
  }

  const entries = fs.readdirSync(directory, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(directory, entry.name);

    if (entry.isDirectory()) {
      const nestedMatch = findFirstMatchingFile(fullPath, predicate);
      if (nestedMatch) {
        return nestedMatch;
      }

      continue;
    }

    if (predicate(entry.name)) {
      return fullPath;
    }
  }

  return null;
}

function resolveUpdaterArtifact(bundleRoot, platform) {
  let artifactPath = null;

  if (platform.startsWith("darwin-")) {
    artifactPath = findFirstMatchingFile(bundleRoot, (name) =>
      name.endsWith(".app.tar.gz"),
    );
  } else if (platform.startsWith("windows-")) {
    artifactPath = findFirstMatchingFile(
      bundleRoot,
      (name) => name.endsWith(".exe") && !name.endsWith(".exe.sig"),
    );
  } else if (platform.startsWith("linux-")) {
    artifactPath = findFirstMatchingFile(bundleRoot, (name) =>
      name.endsWith(".AppImage"),
    );
  }

  if (!artifactPath) {
    throw new Error(
      `No updater artifact found for ${platform} under ${bundleRoot}`,
    );
  }

  return artifactPath;
}

const args = parseScriptArgs(process.argv.slice(2));
const platform = args.get("platform");
const bundleRoot = args.get("bundle-root");
const outputPath = args.get("output");

if (!platform || !bundleRoot || !outputPath) {
  throw new Error(
    "Missing required arguments: --platform, --bundle-root, --output",
  );
}

const workspaceRoot = path.resolve(import.meta.dirname, "..");
const resolvedBundleRoot = path.isAbsolute(bundleRoot)
  ? bundleRoot
  : path.join(workspaceRoot, bundleRoot);
const tauriConfig = JSON.parse(
  fs.readFileSync(
    path.join(workspaceRoot, "src-tauri", "tauri.conf.json"),
    "utf8",
  ),
);

const artifactPath = resolveUpdaterArtifact(resolvedBundleRoot, platform);
const signaturePath = `${artifactPath}.sig`;

if (!fs.existsSync(signaturePath)) {
  throw new Error(`Missing updater signature for ${artifactPath}`);
}

const metadata = {
  version: tauriConfig.version,
  platform,
  asset_name: path.basename(artifactPath),
  signature: fs.readFileSync(signaturePath, "utf8").trim(),
};

fs.mkdirSync(path.dirname(path.join(workspaceRoot, outputPath)), {
  recursive: true,
});
fs.writeFileSync(
  path.join(workspaceRoot, outputPath),
  `${JSON.stringify(metadata, null, 2)}\n`,
);
