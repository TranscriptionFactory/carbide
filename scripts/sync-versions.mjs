import fs from "node:fs";

const pkg = JSON.parse(fs.readFileSync("package.json", "utf8"));

const tauriConf = JSON.parse(
  fs.readFileSync("src-tauri/tauri.conf.json", "utf8"),
);
tauriConf.version = pkg.version;
fs.writeFileSync(
  "src-tauri/tauri.conf.json",
  JSON.stringify(tauriConf, null, 2),
);

const cargoToml = fs.readFileSync("src-tauri/Cargo.toml", "utf8");
fs.writeFileSync(
  "src-tauri/Cargo.toml",
  cargoToml.replace(
    /^version\s*=\s*"[^"]*"/m,
    `version = "${pkg.version}"`,
  ),
);
