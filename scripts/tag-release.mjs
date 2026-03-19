import fs from "node:fs";
import { execSync } from "node:child_process";

const { version } = JSON.parse(fs.readFileSync("package.json", "utf8"));
const tag = `v${version}`;

const existing = execSync("git tag -l", { encoding: "utf8" });
if (existing.split("\n").includes(tag)) {
  console.log(`Tag ${tag} already exists, skipping.`);
  process.exit(0);
}

execSync(`git tag ${tag}`, { stdio: "inherit" });
execSync(`git push origin ${tag}`, { stdio: "inherit" });
console.log(`Tagged and pushed ${tag}`);
